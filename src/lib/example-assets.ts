import { EXAMPLE_PRODUCTS, exampleRender, exampleScreenshot, exampleStudioImage } from './examples';
import { POSES } from './fixtures';

const images = new Map<string, Promise<void>>();
export function decodeExampleImage(url: string) {
  const existing = images.get(url); if (existing) return existing;
  const promise = new Promise<void>((resolve, reject) => {
    const image = new Image(); image.decoding = 'async';
    image.onload = () => { void image.decode().then(resolve, reject); };
    image.onerror = () => reject(new Error('An example image could not load. Replay the example to retry.'));
    image.src = url;
  });
  images.set(url, promise);
  void promise.catch(() => images.delete(url));
  return promise;
}
export function preloadExampleAssets() {
  const urls = [exampleScreenshot.url, exampleStudioImage,
    ...POSES.flatMap(p => [exampleRender(p.id), `/demo/fitexample-v1/before-${p.id}.webp`]),
    ...EXAMPLE_PRODUCTS.map(p => p.imageUrl)];
  void Promise.allSettled(urls.map(decodeExampleImage));
}
