import mongoose from "mongoose";

const connectDB = async () => {
    try
    {
        await mongoose.connect(process.env.MONGO_URI, {
            dbName: 'biometric_system',
        });
        console.log(`MongoDB Connected: ${mongoose.connection.name}`.cyan.underline);
    } catch (error)
    {
        console.error(`Error connecting to MongoDB: ${error.message}`.red.underline.bold);
        if (process.env.NODE_ENV === 'production')
        {
            process.exit(1);
        }
        // In development, continue without database
        console.warn('Continuing without database connection in development mode'.yellow);
    }
};

export default connectDB;