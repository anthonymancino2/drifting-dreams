// Canonical action names shared by every input source and consumed by RacerController.
// Vehicle physics never knows whether an action came from keyboard, touch, or a gamepad.
export const ActionNames = [
    'drift', 'boost', 'usePowerup', 'changeCamera',
    'lookBack', 'respawn', 'pause', 'secondaryAbility'
];

export function createEmptyActions() {
    return {
        steer: 0,
        throttle: 0,
        brake: 0,
        drift: false,
        boost: false,
        usePowerup: false,
        changeCamera: false,
        lookBack: false,
        respawn: false,
        pause: false,
        secondaryAbility: false
    };
}

// Default keyboard bindings. Both WASD and Arrow keys map to the same actions.
export const DefaultKeyboardBindings = {
    accelerate: ['KeyW', 'ArrowUp'],
    brake: ['KeyS', 'ArrowDown'],
    left: ['KeyA', 'ArrowLeft'],
    right: ['KeyD', 'ArrowRight'],
    drift: ['Space'],
    boost: ['ShiftLeft', 'ShiftRight'],
    usePowerup: ['KeyE'],
    changeCamera: ['KeyC'],
    lookBack: ['KeyB'],
    respawn: ['KeyR'],
    pause: ['Escape']
};

// Standard Gamepad API button/axis indices (works positionally for PS4/PS5/Xbox/Switch Pro
// because the browser normalizes "standard" mapping controllers to the same layout).
export const StandardGamepadBindings = {
    steerAxis: 0,
    accelerateButton: 7, // R2 / RT (analog)
    brakeButton: 6,      // L2 / LT (analog)
    drift: 0,            // Cross / A
    boost: 1,            // Circle / B
    usePowerup: 2,        // Square / X
    changeCamera: 3,      // Triangle / Y
    lookBack: 4,          // L1 / LB
    secondaryAbility: 5,  // R1 / RB
    respawn: 13,          // D-Pad Down (hold)
    pause: 9              // Options / Menu / Start
};
