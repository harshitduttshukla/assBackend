import { Server, Socket } from 'socket.io';
import * as pollService from './services/pollService';

export const setupSocket = (io: Server) => {
    io.on('connection', async (socket: Socket) => {
        console.log(`Socket connected: ${socket.id}`);

        // --- ON CONNECTION: STATE RECOVERY ---
        // Check if there is an active poll
        try {
            const activePoll = await pollService.getActivePoll();

            if (activePoll) {
                const now = new Date().getTime();
                const startTime = activePoll.startTime ? new Date(activePoll.startTime).getTime() : now;
                const elapsed = (now - startTime) / 1000;

                if (elapsed < activePoll.duration) {
                    // Poll still active, send details
                    socket.emit('poll_active', {
                        poll: activePoll,
                        timeLeft: activePoll.duration - elapsed
                    });
                } else {
                    // Poll time expired but DB says active -> Close it
                    await pollService.endPoll(activePoll._id as unknown as string);
                    const completedPoll = await pollService.getLastPoll(); // Refetch
                    socket.emit('poll_ended', completedPoll);
                }
            } else {
                // No active poll. Is there a last completed one?
                // Maybe show "Waiting for question"
                // We can send the last poll results if wanted, or just nothing.
            }
        } catch (err) {
            console.error("Error fetching state:", err);
        }

        // --- EVENTS ---

        // Teacher creates a poll
        socket.on('create_poll', async (data) => {
            try {
                // data: { question, options, duration }
                // 1. Create poll in 'created' state (or directly active if flow allows)
                // The assignment says "Ask a new question".
                // Let's assume creation immediately starts it or we have a "Start" step.
                // For simplicity: Create -> Start immediately.

                // Validation: Check if active poll exists?
                const existingActive = await pollService.getActivePoll();
                if (existingActive) {
                    // Force close it? Or error?
                    // "Ask... only if No question has been asked yet (active?)"
                    await pollService.endPoll(existingActive._id as unknown as string);
                }

                const newPoll = await pollService.createPoll({
                    ...data,
                    status: 'active', // Direct start
                    startTime: new Date()
                });

                // Set server-side timeout to close poll
                setTimeout(async () => {
                    const closedPoll = await pollService.endPoll(newPoll._id as unknown as string);
                    io.emit('poll_ended', closedPoll);
                }, data.duration * 1000);

                // Broadcast to existing clients (Students)
                io.emit('new_poll', newPoll);

            } catch (err) {
                console.error("Create poll error:", err);
                socket.emit('error', 'Failed to create poll');
            }
        });

        // Student votes
        socket.on('submit_vote', async (data) => {
            // data: { pollId, studentName, optionIndex }
            try {
                const updatedPoll = await pollService.submitVote(data.pollId, data.studentName, data.optionIndex);

                if (updatedPoll) {
                    // Success.
                    // Teacher needs real-time updates.
                    // Maybe just emit 'poll_updated' with new vote counts?
                    // Sending whole poll object is easiest for sync.
                    io.emit('poll_updated', updatedPoll);
                    socket.emit('vote_success', updatedPoll);
                } else {
                    // Failed (maybe duplicate vote or poll closed)
                    socket.emit('error', 'Vote failed. You may have already voted or poll is closed.');
                }
            } catch (err) {
                console.error("Vote error:", err);
                socket.emit('error', 'Server error during vote');
            }
        });

        // Teacher wants history
        socket.on('get_history', async () => {
            const polls = await pollService.getAllPolls();
            socket.emit('poll_history', polls);
        });

        // --- CHAT & PARTICIPANTS ---

        socket.on('join_check', (name: string) => {
            // If student re-connects, register them
            if (name) {
                pollService.addParticipant(socket.id, name);
                io.emit('participants_update', pollService.getParticipants());
            }
        });

        socket.on('send_message', (data: { sender: string, text: string }) => {
            io.emit('receive_message', data);
        });

        socket.on('kick_user', (socketId: string) => {
            // Only teacher calls this, ideally verify token/role but loose for now
            io.to(socketId).emit('kicked');
            io.sockets.sockets.get(socketId)?.disconnect(true);

            pollService.removeParticipant(socketId);
            io.emit('participants_update', pollService.getParticipants());
        });

        // Cleanup on disconnect
        socket.on('disconnect', () => {
            console.log(`Socket disconnected: ${socket.id}`);
            pollService.removeParticipant(socket.id);
            io.emit('participants_update', pollService.getParticipants());
        });

    });
};
