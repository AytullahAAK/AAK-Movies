/** Avoid orientation locking on tablets and desktop-sized windows. */
export function shouldLockLandscapeOnPhone(isMobileDevice: boolean, hasCoarsePointer: boolean, viewportWidth: number) {
  return isMobileDevice && hasCoarsePointer && viewportWidth <= 900
}
