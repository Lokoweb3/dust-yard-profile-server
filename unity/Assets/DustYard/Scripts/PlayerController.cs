using UnityEngine;
using UnityEngine.InputSystem;

namespace DustYard
{
    /// <summary>
    /// First-person movement ported from the browser game: walk, sprint (ramps up), crouch, slide,
    /// jump with coyote time and a jump buffer, mouse/keyboard and gamepad.
    /// </summary>
    [RequireComponent(typeof(CharacterController))]
    public class PlayerController : MonoBehaviour
    {
        [Header("References")]
        public Transform cameraPivot;

        [Header("Speeds (m/s)")]
        public float walkSpeed = 5.2f;
        public float sprintSpeed = 8.2f;
        public float crouchSpeed = 2.6f;
        public float groundAccel = 13f, airAccel = 2.6f;

        [Header("Jumping")]
        public float jumpSpeed = 7.2f;
        public float gravity = 22f;
        public float coyoteTime = 0.12f, jumpBufferTime = 0.12f;

        [Header("Slide")]
        public float slideBoost = 11f, slideTime = 0.75f, slideFriction = 6f;

        [Header("Look")]
        public float mouseSensitivity = 0.12f;
        public float gamepadLookSpeed = 160f;

        public bool IsSprinting { get; private set; }
        public bool IsMoving { get; private set; }
        public bool IsGrounded => cc.isGrounded;
        public float Pitch => pitch;

        CharacterController cc;
        Vector3 velocity;
        float yaw, pitch, recoilPitch, coyoteT, bufferT, slideT, sprintRamp, camHeight = 1.62f;
        bool crouching;
        const float StandHeight = 1.8f, CrouchHeight = 1.1f;

        void Awake()
        {
            cc = GetComponent<CharacterController>();
            cc.height = StandHeight; cc.radius = 0.4f; cc.center = new Vector3(0, StandHeight / 2f, 0);
            cc.stepOffset = 0.4f;      // the browser maps use 0.33 m steps
            cc.slopeLimit = 50f;
            yaw = transform.eulerAngles.y;
            LockCursor(true);
        }

        public void AddRecoil(float degrees) { recoilPitch += degrees; }

        public static void LockCursor(bool on)
        {
            Cursor.lockState = on ? CursorLockMode.Locked : CursorLockMode.None;
            Cursor.visible = !on;
        }

        void Update()
        {
            float dt = Time.deltaTime;
            var kb = Keyboard.current; var mouse = Mouse.current; var pad = Gamepad.current;

            // ---- look
            Vector2 look = Vector2.zero;
            if (mouse != null && Cursor.lockState == CursorLockMode.Locked) look += mouse.delta.ReadValue() * mouseSensitivity;
            if (pad != null) look += pad.rightStick.ReadValue() * gamepadLookSpeed * dt;
            yaw += look.x;
            pitch = Mathf.Clamp(pitch - look.y, -85f, 85f);
            recoilPitch = Mathf.Lerp(recoilPitch, 0f, 1f - Mathf.Exp(-10f * dt));
            transform.rotation = Quaternion.Euler(0f, yaw, 0f);
            cameraPivot.localRotation = Quaternion.Euler(pitch - recoilPitch, 0f, 0f);

            // ---- input
            Vector2 move = Vector2.zero;
            if (kb != null)
            {
                if (kb.wKey.isPressed) move.y += 1; if (kb.sKey.isPressed) move.y -= 1;
                if (kb.dKey.isPressed) move.x += 1; if (kb.aKey.isPressed) move.x -= 1;
            }
            if (pad != null) move += pad.leftStick.ReadValue();
            move = Vector2.ClampMagnitude(move, 1f);
            bool sprintHeld = (kb != null && kb.leftShiftKey.isPressed) || (pad != null && pad.leftStickButton.isPressed);
            bool jumpPressed = (kb != null && kb.spaceKey.wasPressedThisFrame) || (pad != null && pad.buttonSouth.wasPressedThisFrame);
            bool crouchPressed = (kb != null && (kb.cKey.wasPressedThisFrame || kb.leftCtrlKey.wasPressedThisFrame)) || (pad != null && pad.buttonEast.wasPressedThisFrame);

            bool grounded = cc.isGrounded;
            coyoteT = grounded ? coyoteTime : coyoteT - dt;
            bufferT = jumpPressed ? jumpBufferTime : bufferT - dt;

            IsSprinting = sprintHeld && move.y > 0.3f && !crouching && slideT <= 0f;
            sprintRamp = Mathf.MoveTowards(sprintRamp, IsSprinting ? 1f : 0f, dt * (IsSprinting ? 2.2f : 5f));

            // crouch, or slide if you crouch while sprinting
            if (crouchPressed)
            {
                if (IsSprinting && grounded)
                {
                    slideT = slideTime; crouching = true;
                    Vector3 f = transform.forward;
                    velocity.x = f.x * slideBoost; velocity.z = f.z * slideBoost;
                }
                else crouching = !crouching;
            }

            // ---- horizontal movement
            float target = crouching ? crouchSpeed : Mathf.Lerp(walkSpeed, sprintSpeed, sprintRamp);
            Vector3 wish = (transform.right * move.x + transform.forward * move.y) * target;
            if (slideT > 0f)
            {
                slideT -= dt;
                velocity.x = Mathf.MoveTowards(velocity.x, 0f, slideFriction * dt);
                velocity.z = Mathf.MoveTowards(velocity.z, 0f, slideFriction * dt);
                if (slideT <= 0f) crouching = kb != null && kb.cKey.isPressed;
            }
            else
            {
                float k = 1f - Mathf.Exp(-(grounded ? groundAccel : airAccel) * dt);
                velocity.x = Mathf.Lerp(velocity.x, wish.x, k);
                velocity.z = Mathf.Lerp(velocity.z, wish.z, k);
            }

            // ---- jumping and gravity
            if (bufferT > 0f && coyoteT > 0f)
            {
                velocity.y = jumpSpeed; bufferT = 0f; coyoteT = 0f; slideT = 0f;
                if (crouching && CanStand()) crouching = false;
            }
            if (grounded && velocity.y < 0f) velocity.y = -2f;   // keeps you stuck to slopes and steps
            velocity.y -= gravity * dt;

            // ---- crouch height (only stand up if there is room)
            if (!crouching && cc.height < StandHeight - 0.01f && !CanStand()) crouching = true;   // no room to stand up yet
            float h = crouching ? CrouchHeight : StandHeight;
            if (!Mathf.Approximately(cc.height, h)) { cc.height = h; cc.center = new Vector3(0, h / 2f, 0); }

            CollisionFlags flags = cc.Move(velocity * dt);
            if ((flags & CollisionFlags.Above) != 0 && velocity.y > 0f) velocity.y = 0f;   // bonk on ceilings
            IsMoving = new Vector2(velocity.x, velocity.z).magnitude > 1f;

            camHeight = Mathf.Lerp(camHeight, crouching ? 0.95f : 1.62f, 1f - Mathf.Exp(-12f * dt));
            cameraPivot.localPosition = new Vector3(0f, camHeight, 0f);

            // ---- cursor: Esc frees it, a click grabs it again
            if (kb != null && kb.escapeKey.wasPressedThisFrame) LockCursor(false);
            if (mouse != null && mouse.leftButton.wasPressedThisFrame && Cursor.lockState != CursorLockMode.Locked) LockCursor(true);
        }

        bool CanStand()
        {
            Vector3 p = transform.position + Vector3.up * (CrouchHeight - cc.radius);
            return !Physics.SphereCast(p, cc.radius * 0.95f, Vector3.up, out _, StandHeight - CrouchHeight + 0.05f, ~0, QueryTriggerInteraction.Ignore);
        }
    }
}
