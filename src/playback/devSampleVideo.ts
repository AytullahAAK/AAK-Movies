import type { DirectMediaSource } from './NativeVideoPlayer'

/** Licensed MDN CC0 sample used only by the local development player check. */
export const mdnFlowerSample: { title: string; source: DirectMediaSource } = {
  title: 'MDN CC0 flower sample',
  source: {
    url: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
    contentType: 'video/mp4',
  },
}
