import { getPublicGalleryPhotos } from "@/app/actions/gallery";
import GalleryClient from "./GalleryClient";

export const dynamic = "force-dynamic";

export default async function GalleryPage() {
  const photos = await getPublicGalleryPhotos();
  return <GalleryClient initialPhotos={photos} />;
}
