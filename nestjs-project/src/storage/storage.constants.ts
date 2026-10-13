// Client used for server-side calls (bucket setup, multipart control, uploads).
export const S3_CLIENT = Symbol('S3_CLIENT');

// Client used only to sign URLs handed to browsers. It points at
// STORAGE_PUBLIC_ENDPOINT so signed hosts are reachable outside Docker.
export const S3_PRESIGN_CLIENT = Symbol('S3_PRESIGN_CLIENT');
