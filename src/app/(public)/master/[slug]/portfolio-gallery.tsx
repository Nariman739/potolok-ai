"use client";

import { useState } from "react";
import Image from "next/image";
import { X, ChevronLeft, ChevronRight } from "lucide-react";

interface Work {
  id: string;
  title: string | null;
  description: string | null;
  ceilingType: string | null;
  area: number | null;
  photos: string[];
  videoUrl: string | null;
}

interface PortfolioGalleryProps {
  works: Work[];
}

export function PortfolioGallery({ works }: PortfolioGalleryProps) {
  const [lightbox, setLightbox] = useState<{ workIndex: number; photoIndex: number } | null>(null);

  const currentWork = lightbox ? works[lightbox.workIndex] : null;
  const currentPhoto = currentWork ? currentWork.photos[lightbox!.photoIndex] : null;

  const navigatePhoto = (dir: -1 | 1) => {
    if (!lightbox || !currentWork) return;
    const nextPhoto = lightbox.photoIndex + dir;
    if (nextPhoto >= 0 && nextPhoto < currentWork.photos.length) {
      setLightbox({ ...lightbox, photoIndex: nextPhoto });
    }
  };

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {works.map((work, workIndex) => (
          <div
            key={work.id}
            className="group rounded-xl overflow-hidden bg-white shadow-sm hover:shadow-md transition-shadow cursor-pointer"
            onClick={() => setLightbox({ workIndex, photoIndex: 0 })}
          >
            {/* Фото */}
            <div className="relative aspect-[4/3] bg-muted">
              {work.photos.length > 0 ? (
                <Image
                  src={work.photos[0]}
                  alt={work.title || "Работа"}
                  fill
                  className="object-cover group-hover:scale-105 transition-transform duration-300"
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                />
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                  Нет фото
                </div>
              )}
              {work.photos.length > 1 && (
                <span className="absolute top-2 right-2 bg-black/60 text-white text-xs px-2 py-0.5 rounded-full">
                  {work.photos.length} фото
                </span>
              )}
            </div>

            {/* Инфо */}
            <div className="p-3">
              {work.title && (
                <p className="font-medium text-sm">{work.title}</p>
              )}
              <div className="flex items-center gap-2 mt-1">
                {work.ceilingType && (
                  <span className="text-xs bg-muted px-2 py-0.5 rounded-full">
                    {work.ceilingType}
                  </span>
                )}
                {work.area && (
                  <span className="text-xs text-muted-foreground">
                    {work.area} м²
                  </span>
                )}
              </div>
              {work.description && (
                <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">
                  {work.description}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Лайтбокс */}
      {lightbox && currentWork && currentPhoto && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
          onClick={() => setLightbox(null)}
        >
          {/* Закрыть */}
          <button
            className="absolute top-4 right-4 text-white/80 hover:text-white z-10"
            onClick={() => setLightbox(null)}
          >
            <X className="h-8 w-8" />
          </button>

          {/* Навигация */}
          {currentWork.photos.length > 1 && (
            <>
              {lightbox.photoIndex > 0 && (
                <button
                  className="absolute left-4 text-white/80 hover:text-white z-10"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigatePhoto(-1);
                  }}
                >
                  <ChevronLeft className="h-10 w-10" />
                </button>
              )}
              {lightbox.photoIndex < currentWork.photos.length - 1 && (
                <button
                  className="absolute right-4 text-white/80 hover:text-white z-10"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigatePhoto(1);
                  }}
                >
                  <ChevronRight className="h-10 w-10" />
                </button>
              )}
            </>
          )}

          {/* Фото */}
          <div
            className="relative max-w-4xl max-h-[80vh] w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <Image
              src={currentPhoto}
              alt={currentWork.title || "Фото работы"}
              width={1200}
              height={900}
              className="w-full h-auto max-h-[80vh] object-contain rounded-lg"
              sizes="100vw"
            />

            {/* Инфо под фото */}
            <div className="mt-3 text-white text-center">
              {currentWork.title && (
                <p className="font-medium">{currentWork.title}</p>
              )}
              <div className="flex items-center justify-center gap-3 mt-1 text-sm text-white/70">
                {currentWork.ceilingType && <span>{currentWork.ceilingType}</span>}
                {currentWork.area && <span>{currentWork.area} м²</span>}
                {currentWork.photos.length > 1 && (
                  <span>
                    {lightbox.photoIndex + 1} / {currentWork.photos.length}
                  </span>
                )}
              </div>
              {currentWork.description && (
                <p className="mt-2 text-sm text-white/60 max-w-lg mx-auto">
                  {currentWork.description}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
