declare module 'adm-zip' {
  interface AdmZipInstance {
    extractAllTo(targetPath: string, overwrite: boolean): void
    getEntries(): unknown[]
  }
  const AdmZip: new (data?: Buffer | string) => AdmZipInstance
  export default AdmZip
}
