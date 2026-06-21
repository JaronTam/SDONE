# NFR Compliance Verification Checklist

**Story 7.7** — Manual verification steps for NFR-P1 and NFR-P6.

## NFR-P1: Canvas Rendering ≥30fps at ≤15 Modules

1. Launch the application (`npm run dev`)
2. Place 15 modules on the canvas (mix of sources, stocks, sinks)
3. Connect them into 5 source→stock→sink stacks
4. Start simulation (▶ Run)
5. Let it run for ≥10 seconds
6. Open browser console (F12)
7. Verify: No "⚠️ P95 FPS below 30" warning appears
8. Verify: PerformanceMonitor degradation mode is "full" (not "sparse" or "off")
   - **How to observe**: The degradation mode is indirectly visible through particle rendering density on the canvas:
     - **"full" mode**: All particles render at full density — normal appearance
     - **"sparse" mode**: Every other particle is skipped — visibly fewer particles on canvas
     - **"off" mode**: No particles rendered — canvas shows only module boxes, no flowing particles
   - If particles appear at full density with no visible reduction, the degradation mode is "full" ✅

**Pass threshold:** P95 FPS ≥30 over the 10s window

## NFR-P6: Bundle Budget ≤200KB gzip

1. Run `npm run build`
2. Run `npm run build:check`
3. Verify: Exit code 0, "✅ Bundle budget OK"

**Pass threshold:** Total JS gzip size ≤200KB

## Verification Record

| Date | NFR-P1          | NFR-P6          | Verified By |
| ---- | --------------- | --------------- | ----------- |
|      | ☐ Pass / ☐ Fail | ☐ Pass / ☐ Fail |             |
