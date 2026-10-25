# Vid-Process Project Rules

## 1. Interaction & Planning Guardrail
- **Plan First, Never Auto-Fix**: When debugging or proposing code/infrastructure changes, always formulate a clear plan and obtain explicit user approval before editing files or running modifying commands.

## 2. Linux System & Resource Management
- **Swapfile Resizing Invariant**: In Linux/Ubuntu, never run `fallocate` or `mkswap` on an active swapfile without turning it off first. Always run `sudo swapoff /swapfile` before resizing or formatting swap.

## 3. FFmpeg Low-Memory Video Processing
- **Avoid Monolithic Multi-Stream Filtergraphs**: Never chain multiple `trim` + `vstack` + `overlay` filters referencing the same input video across different timestamps in a single FFmpeg process. FFmpeg's internal frame queues will buffer uncompressed frames (3 MB per frame at 1080x1920) across all branches, causing rapid memory exhaustion and `SIGKILL`.
- **Prefer Two-Phase Pipeline**:
  1. *Phase 1 (Pre-Bake)*: Pre-render individual split/layout segments into small temporary files using fast input seeking (`-ss`). Each sub-render uses < 150 MB RAM.
  2. *Phase 2 (Linear Overlay)*: Perform a simple linear overlay of the pre-baked segments onto the primary timeline without inline trimming or vertical stacking.
