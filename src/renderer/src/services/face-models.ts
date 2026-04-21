import * as faceapi from 'face-api.js'

let faceModelsReady = false
let faceModelsPromise: Promise<void> | null = null

export const ensureFaceModelsLoaded = async () => {
  if (faceModelsReady) return
  if (!faceModelsPromise) {
    const modelUrl = new URL('./models', window.location.href).href
    faceModelsPromise = Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(modelUrl),
      faceapi.nets.faceExpressionNet.loadFromUri(modelUrl),
      faceapi.nets.ageGenderNet.loadFromUri(modelUrl)
    ]).then(() => {
      faceModelsReady = true
    })
  }
  await faceModelsPromise
}

export const areFaceModelsReady = () => faceModelsReady
