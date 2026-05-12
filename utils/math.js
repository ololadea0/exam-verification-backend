// export const euclideanDistance = (vector1, vector2) => {
//     let sum = 0;
//     for (let i = 0; i < vector1.length; i++)
//     {
//         const diff = vector1[i] - vector2[i];
//         sum += diff * diff;
//     }
//     return Math.sqrt(sum);
// };

export const cosineSimilarity = (vectorA, vectorB) => {
    let dotProduct = 0;
    let magnitudeA = 0;
    let magnitudeB = 0;

    for (let i = 0; i < vectorA.length; i++)
    {
        dotProduct += vectorA[i] * vectorB[i];
        magnitudeA += vectorA[i] * vectorA[i];
        magnitudeB += vectorB[i] * vectorB[i];
    }

    magnitudeA = Math.sqrt(magnitudeA);
    magnitudeB = Math.sqrt(magnitudeB);

    if (magnitudeA === 0 || magnitudeB === 0)
    {
        return 0;
    }

    return dotProduct / (magnitudeA * magnitudeB);
};