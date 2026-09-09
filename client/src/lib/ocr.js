import { createWorker } from 'tesseract.js';

// Kept alive for the session so repeated scans don't re-download language data.
let workerPromise = null;

function getWorker() {
  if (!workerPromise) {
    workerPromise = createWorker(['eng', 'ara']);
  }
  return workerPromise;
}

export async function recognizeText(imageSrc) {
  const worker = await getWorker();
  const { data } = await worker.recognize(imageSrc);
  return data.text.trim();
}
