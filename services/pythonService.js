

import axios from "axios";

const PYTHON_URL = process.env.PYTHON_SERVICE_URL || "http://localhost:8000";

export const getBestPythonEmbedding = async (base64Images) => {
    const images = Array.isArray(base64Images)
        ? base64Images
        : typeof base64Images === "string"
            ? [base64Images]
            : [];

    console.log(PYTHON_URL);

    if (images.length === 0)
    {
        throw new Error("No images provided for face embedding");
    }

    try
    {
        const res = await axios.post(`${PYTHON_URL}/embed-best`, {
            images
        });

        return res.data;

    } catch (error)
    {
        console.error("PYTHON ERROR:", error.message);
        console.error(error.response?.data);

        throw new Error(
            error.response?.data?.detail ||
            error.response?.data?.error ||
            error.message
        );
    }
};

export const getPythonEmbedding = async (base64Image) => {
    const image = Array.isArray(base64Image)
        ? base64Image[0]
        : base64Image;

    console.log("PYTHON_URL:", PYTHON_URL);
    if (!image || typeof image !== "string")
    {
        throw new Error("No image provided for face embedding");
    }

    try
    {
        const res = await axios.post(`${PYTHON_URL}/embed`, {
            image
        });
        return res.data;

    } catch (error)
    {
        console.error("PYTHON ERROR:", error.message);
        console.error(error.response?.data);

        throw new Error(
            error.response?.data?.detail ||
            error.response?.data?.error ||
            error.message
        );
    }
};