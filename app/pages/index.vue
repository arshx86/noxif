<template>
  <div class="min-h-screen flex items-center justify-center px-6 py-12">
    <!-- dropzonee -->

    <div
      v-if="stage === 'idle'"
      v-gsap.from="{ opacity: 0, y: 12, duration: 0.4, filter: 'blur(4px)' }"
      ref="dropZoneRef"
      :class="[
        'w-full max-w-xl border transition-colors duration-200',
        isOverDropZone ? 'border-primary bg-muted' : 'border-dashed border-accented',
      ]">
      <div class="p-12 flex flex-col items-center gap-6">
        <div class="size-12 border border-accented flex items-center justify-center">
          <UIcon name="i-ph-image" class="text-xl text-dimmed" />
        </div>

        <div class="text-center space-y-2">
          <h1 class="text-2xl font-mono">noxif</h1>
          <p class="text-sm font-mono text-muted">Drop an image to strip its metadata</p>
          <p class="text-xs font-mono text-dimmed">JPG / JPEG / TIFF</p>
          <NuxtLink
            to="https://github.com/arshx86/noxif"
            class="text-xs font-mono text-primary underline">
            Github
          </NuxtLink>
        </div>

        <UButton @click="() => openFileDialog()">Select file</UButton>
      </div>
    </div>

    <!-- Preview -->
    <div
      v-else-if="stage === 'loaded'"
      v-gsap.from="{ opacity: 0, y: 12, duration: 0.4, filter: 'blur(4px)' }"
      class="w-full max-w-2xl">
      <UCard variant="outline" class="overflow-hidden">
        <template #header>
          <div class="flex items-center justify-between">
            <span class="text-xs font-mono text-muted truncate">
              {{ currentFileName }}
            </span>
            <UBadge color="neutral" variant="subtle" class="font-mono">
              {{ currentFileSize }}
            </UBadge>
          </div>
        </template>

        <!-- Preview -->
        <div class="bg-muted flex items-center justify-center overflow-hidden max-h-70">
          <img
            v-if="previewUrl"
            :src="previewUrl"
            alt="Preview"
            class="max-h-70 w-auto object-contain" />
        </div>

        <!-- EXIF data -->
        <USeparator />
        <div v-if="exifEntries.length > 0">
          <div class="px-5 py-3">
            <span class="text-base font-mono text-muted">
              <b>{{ exifEntries.length }}</b>
              metadata fields
            </span>
          </div>
          <USeparator />
          <div class="max-h-48 overflow-y-auto">
            <div
              v-for="(entry, i) in exifEntries"
              :key="i"
              class="px-5 py-2 flex justify-between gap-4 border-b border-muted">
              <span class="text-xs font-mono text-dimmed shrink-0">
                {{ entry.tag }}
              </span>
              <span class="text-xs font-mono text-default text-right truncate">
                {{ entry.value }}
              </span>
            </div>
          </div>
        </div>
        <div v-else class="px-5 py-4">
          <UEmpty
            variant="naked"
            title="No EXIF Data found"
            description="This file is clean!" />
        </div>

        <template #footer>
          <div class="flex items-center justify-between gap-4">
            <UButton
              variant="ghost"
              color="neutral"
              trailingIcon="mdi:arrow-left"
              @click="resetState">
              Discard
            </UButton>
            <UButton
              :disabled="exifEntries.length === 0"
              color="primary"
              variant="soft"
              icon="i-ph-download-simple"
              @click="stripAndDownload()">
              Clear
            </UButton>
          </div>
        </template>
      </UCard>
    </div>

    <!-- Processing -->
    <div
      v-else-if="stage === 'processing'"
      v-gsap.from="{ opacity: 0, duration: 0.3 }"
      class="flex flex-col items-center gap-6">
      <div class="size-16 border border-accented flex items-center justify-center">
        <UIcon
          v-gsap.infinitely.to="{ rotation: 360, duration: 2, ease: 'none' }"
          name="i-ph-circle-notch"
          class="text-2xl text-dimmed" />
      </div>
      <div class="text-center space-y-1">
        <p class="text-sm font-mono text-muted">Processing</p>
        <p class="text-xs font-mono text-dimmed">Stripping metadata...</p>
      </div>
    </div>

    <!-- finished  -->
    <div
      v-else-if="stage === 'done'"
      v-gsap.from="{ opacity: 0, y: 12, duration: 0.4 }"
      class="flex flex-col items-center gap-6">
      <div
        v-gsap.from="{ scale: 0.8, opacity: 0, duration: 0.4, ease: 'back.out(1.9)' }"
        class="size-16 border border-inverted flex items-center justify-center">
        <UIcon name="i-ph-check-bold" class="text-2xl" />
      </div>
      <div class="text-center space-y-1">
        <p class="text-sm font-mono">Clean file downloaded</p>
        <p class="text-xs font-mono text-dimmed">All EXIF data has been removed</p>
      </div>
      <UButton variant="subtle" color="neutral" @click="resetState()">
        Process another
      </UButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useFileDialog, useDropZone } from "@vueuse/core";
import piexif from "piexifjs";
import { saveAs } from "file-saver";

type Stage = "idle" | "loaded" | "processing" | "done";

const stage = ref<Stage>("idle");
const dropZoneRef = ref<HTMLElement>();
const previewUrl = ref<string>("");
const currentFileName = ref("");
const currentFileSize = ref("");
const rawImageData = ref("");
const currentFile = ref<File | null>(null);

interface ExifEntry {
  tag: string;
  value: string;
}
const exifEntries = ref<ExifEntry[]>([]);

// idf to tagnames
const TAG_NAMES: Record<string, Record<number, string>> = {
  "0th": {
    271: "Make",
    272: "Model",
    274: "Orientation",
    282: "XResolution",
    283: "YResolution",
    296: "ResolutionUnit",
    305: "Software",
    306: "DateTime",
    315: "Artist",
    316: "HostComputer",
    33432: "Copyright",
  },
  Exif: {
    33434: "ExposureTime",
    33437: "FNumber",
    34850: "ExposureProgram",
    34855: "ISOSpeedRatings",
    36864: "ExifVersion",
    36867: "DateTimeOriginal",
    36868: "DateTimeDigitized",
    37377: "ShutterSpeed",
    37378: "Aperture",
    37380: "ExposureBias",
    37383: "MeteringMode",
    37385: "Flash",
    37386: "FocalLength",
    37521: "SubSecTimeOriginal",
    40960: "FlashpixVersion",
    40961: "ColorSpace",
    40962: "PixelXDimension",
    40963: "PixelYDimension",
    41495: "SensingMethod",
    41986: "ExposureMode",
    41987: "WhiteBalance",
    41989: "FocalLengthIn35mm",
    42034: "LensInfo",
    42035: "LensMake",
    42036: "LensModel",
  },
  GPS: {
    0: "GPSVersionID",
    1: "GPSLatitudeRef",
    2: "GPSLatitude",
    3: "GPSLongitudeRef",
    4: "GPSLongitude",
    5: "GPSAltitudeRef",
    6: "GPSAltitude",
    7: "GPSTimeStamp",
    29: "GPSDateStamp",
  },
};

function parseExifData(dataUrl: string): ExifEntry[] {
  try {
    const exifObj = piexif.load(dataUrl);
    const entries: ExifEntry[] = [];

    for (const ifd of ["0th", "Exif", "GPS"] as const) {
      const ifdData = exifObj[ifd];
      if (!ifdData) continue;
      for (const tagId of Object.keys(ifdData)) {
        const numId = Number(tagId);
        const tagName = TAG_NAMES[ifd]?.[numId] ?? `${ifd}:${tagId}`;
        const val: unknown = ifdData[numId];
        if (val == null) continue;

        let display: string;
        // handle diff data types for better display
        if (val instanceof Uint8Array || val instanceof Array) {
          display = val.length > 20 ? `[${val.length} bytes]` : val.toString();
        } else if (typeof val === "object") {
          display = JSON.stringify(val);
        } else {
          display = String(val);
        }

        if (display && display !== "undefined") {
          entries.push({ tag: tagName, value: display });
        }
      }
    }
    return entries;
  } catch {
    return [];
  }
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// File dialog
const {
  files: dialogFiles,
  open: openFileDialog,
  reset: resetDialog,
} = useFileDialog({
  accept: "image/jpeg,image/tiff",
  multiple: false,
});

function loadFile(file: File) {
  currentFile.value = file;
  currentFileName.value = file.name;
  currentFileSize.value = formatFileSize(file.size);

  const reader = new FileReader();
  reader.onload = (e) => {
    const data = e.target?.result as string;
    if (!data) return;
    rawImageData.value = data;
    previewUrl.value = data;
    exifEntries.value = parseExifData(data);
    stage.value = "loaded";
  };
  reader.readAsDataURL(file);
}

function stripAndDownload() {
  if (!rawImageData.value || !currentFile.value) return;

  stage.value = "processing";

  setTimeout(() => {
    try {
      const cleaned = piexif.remove(rawImageData.value);
      const blob = dataURLtoBlob(cleaned);
      saveAs(blob, `vanished_${currentFile.value!.name}`);
    } catch {
      const blob = dataURLtoBlob(rawImageData.value);
      saveAs(blob, `vanished_${currentFile.value!.name}`);
    }
    stage.value = "done";
  }, 800);
}

function resetState() {
  stage.value = "idle";
  previewUrl.value = "";
  currentFileName.value = "";
  currentFileSize.value = "";
  rawImageData.value = "";
  currentFile.value = null;
  exifEntries.value = [];
  resetDialog();
}

function dataURLtoBlob(dataurl: string): Blob {
  const arr = dataurl.split(",");
  const header = arr[0];
  const data = arr[1];
  if (!header || !data) throw new Error("Invalid data URL");
  const mimeMatch = header.match(/:(.*?);/);
  if (!mimeMatch) throw new Error("Could not determine mime type");
  const mime = mimeMatch[1];
  const bstr = atob(data);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
}

// Drop zone
const { isOverDropZone } = useDropZone(dropZoneRef, {
  onDrop: (droppedFiles) => {
    const f = droppedFiles?.[0];
    if (f) loadFile(f);
  },
});

// Watch file dialog
watch(dialogFiles, (newFiles) => {
  const f = newFiles?.[0];
  if (f) loadFile(f);
});
</script>
