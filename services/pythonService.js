

import axios from "axios";

const PYTHON_URL = (
    process.env.PYTHON_SERVICE_URL || "http://localhost:8000"
).replace(/\/+$/, "");

const PYTHON_REQUEST_TIMEOUT_MS = Number.parseInt(
    process.env.PYTHON_REQUEST_TIMEOUT_MS || "10000",
    10
);

const getPythonErrorMessage = (data, fallback) => {
    if (!data)
    {
        return fallback;
    }

    if (Array.isArray(data.candidates))
    {
        const candidateError = data.candidates.find((candidate) => candidate.error)?.error;

        if (candidateError)
        {
            return candidateError;
        }
    }

    if (typeof data.detail === "string" && data.error)
    {
        return data.error;
    }

    if (typeof data.error === "string")
    {
        return data.error;
    }

    if (typeof data.detail === "string")
    {
        return data.detail;
    }

    return fallback;
};

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
        const res = await axios.post(
            `${PYTHON_URL}/embed-best`,
            { images },
            { timeout: PYTHON_REQUEST_TIMEOUT_MS }
        );

        if (res.data?.error || !Array.isArray(res.data?.embedding))
        {
            throw new Error(getPythonErrorMessage(res.data, "Face embedding generation failed"));
        }

        return res.data;

    } catch (error)
    {
        console.error("PYTHON ERROR:", error.message);
        console.error(error.response?.data);

        throw new Error(
            getPythonErrorMessage(error.response?.data, error.message) ||
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
        const res = await axios.post(
            `${PYTHON_URL}/embed`,
            { image },
            { timeout: PYTHON_REQUEST_TIMEOUT_MS }
        );

        if (res.data?.error || !Array.isArray(res.data?.embedding))
        {
            throw new Error(getPythonErrorMessage(res.data, "Face embedding generation failed"));
        }

        return res.data;

    } catch (error)
    {
        console.error("PYTHON ERROR:", error.message);
        console.error(error.response?.data);

        throw new Error(
            getPythonErrorMessage(error.response?.data, error.message) ||
            error.message
        );
    }
};
