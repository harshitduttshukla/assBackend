import mongoose, { Document, Schema } from 'mongoose';

interface IVote {
    studentName: string;
    optionIndex: number;
}

export interface IPoll extends Document {
    question: string;
    options: { text: string; isCorrect: boolean }[];
    duration: number; // in seconds
    startTime?: Date;
    status: 'created' | 'active' | 'completed';
    votes: IVote[];
    
    createdAt: Date;
}

const VoteSchema = new Schema<IVote>({
    studentName: { type: String, required: true },
    optionIndex: { type: Number, required: true },
});

const PollSchema = new Schema<IPoll>({
    question: { type: String, required: true },
    options: [
        {
            text: { type: String, required: true },
            isCorrect: { type: Boolean, default: false },
        },
    ],
    duration: { type: Number, required: true },
    startTime: { type: Date },
    status: { type: String, enum: ['created', 'active', 'completed'], default: 'created' },
    votes: [VoteSchema],
}, {
    timestamps: true,
});

export default mongoose.model<IPoll>('Poll', PollSchema);
