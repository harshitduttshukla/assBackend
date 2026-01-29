import mongoose from 'mongoose';
import Poll, { IPoll } from '../models/Poll';

// Fallback in-memory store
let localPolls: any[] = [];

export const createPoll = async (data: Partial<IPoll>) => {
    if (mongoose.connection.readyState !== 1) {
        console.log("DB Offline: Creating poll in memory");
        const newPoll = {
            ...data,
            _id: Date.now().toString(),
            votes: [],
            createdAt: new Date(),
            updatedAt: new Date(),
            save: () => Promise.resolve(newPoll) // Mock save
        };
        localPolls.push(newPoll);
        return newPoll as any;
    }
    const poll = new Poll(data);
    return await poll.save();
};

export const getActivePoll = async () => {
    if (mongoose.connection.readyState !== 1) {
        return localPolls.find(p => p.status === 'active');
    }
    return await Poll.findOne({ status: 'active' });
};

export const getLastPoll = async () => {
    if (mongoose.connection.readyState !== 1) {
        return localPolls.sort((a, b) => b.createdAt - a.createdAt)[0];
    }
    return await Poll.findOne().sort({ createdAt: -1 });
}

export const getAllPolls = async () => {
    if (mongoose.connection.readyState !== 1) {
        return localPolls.sort((a, b) => b.createdAt - a.createdAt);
    }
    return await Poll.find().sort({ createdAt: -1 });
};

export const submitVote = async (pollId: string, studentName: string, optionIndex: number) => {
    if (mongoose.connection.readyState !== 1) {
        const poll = localPolls.find(p => p._id.toString() === pollId.toString() && p.status === 'active');
        if (poll) {
            const hasVoted = poll.votes.some((v: any) => v.studentName === studentName);
            if (!hasVoted) {
                poll.votes.push({ studentName, optionIndex });
                return poll;
            }
        }
        return poll; // Return current state even if vote invalid (simulating DB behavior slightly)
    }

    // Atomic update to prevent race conditions
    // Only update if the student name is NOT in the votes array
    const poll = await Poll.findOneAndUpdate(
        {
            _id: pollId,
            status: 'active',
            'votes.studentName': { $ne: studentName }
        },
        {
            $push: { votes: { studentName, optionIndex } }
        },
        { new: true }
    );

    return poll;
};

export const endPoll = async (pollId: string) => {
    if (mongoose.connection.readyState !== 1) {
        const poll = localPolls.find(p => p._id.toString() === pollId.toString());
        if (poll) {
            poll.status = 'completed';
            return poll;
        }
        return null;
    }
    return await Poll.findByIdAndUpdate(pollId, { status: 'completed' }, { new: true });
}


// Participants Store (In-memory)
let participants: { id: string, name: string }[] = [];

export const addParticipant = (id: string, name: string) => {
    if (!participants.find(p => p.id === id)) {
        participants.push({ id, name });
    }
};

export const removeParticipant = (id: string) => {
    participants = participants.filter(p => p.id !== id);
};

export const getParticipants = () => participants;

export const startPoll = async (pollId: string) => {
    if (mongoose.connection.readyState !== 1) {
        const poll = localPolls.find(p => p._id.toString() === pollId.toString());
        if (poll) {
            poll.status = 'active';
            poll.startTime = new Date();
            return poll;
        }
        return null;
    }
    return await Poll.findByIdAndUpdate(pollId, { status: 'active', startTime: new Date() }, { new: true });
}
