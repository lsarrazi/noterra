// Centralized configuration for the planet experience
export const cameraConfig = {
    fov: 75,
    aspect: 1,
    near: 0.00001,
    far: 200,
};

export const rendererConfig = {
    clearColor: 0x000020,
    logarithmicDepthBuffer: true,
};

export const orbitConfig = {
    enableDamping: true,
    dampingFactor: 0.08,
    minDistance: 0.50001,
    maxDistance: 5,
    zoomStepIn: 0.95, // multiplier when zooming in
    zoomStepOut: 1 / 0.95, // multiplier when zooming out
    zoomK: 6.0, // exponential convergence
    rotateBase: 0.5,
    rotateMin: 0.0,
    rotateEaseExp: 0.85,
};

export const planetSurfaceConfig = {
    radius: 0.5,
    segments: 192,
    scale: 6.0,
    seaLevel: 0.48,
    seaColor: 0x2a5d9a,
    landLow: 0x2f6a3a,
    landHigh: 0x9c8a5a,
    normalStrength: 0.12,
    detailScale: 22.0,
    detailStrength: 10000,
    gridColor: 0xfdfdfd,
    gridStrength: 0.25,
    axialTilt: 23.439281,
};

export const atmosphereConfig = {
    raySteps: 128,
    extinctionMultiplier: 1.0,
    alphaMultiplier: 1.0,
};
