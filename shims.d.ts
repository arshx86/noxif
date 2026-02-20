declare module "piexifjs" {
  const piexif: {
    load(data: string): Record<string, Record<number, unknown>>;
    dump(exifObj: Record<string, unknown>): string;
    insert(exifStr: string, data: string): string;
    remove(data: string): string;
  };
  export default piexif;
}
