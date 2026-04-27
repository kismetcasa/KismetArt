const uploadToArweave = async (
  file: File,
  getProgress: (progress: number) => void = () => {}
): Promise<string> => {
  return new Promise<string>((resolve, reject) => {
    const xhr = new XMLHttpRequest()

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        // 0-95%: uploading to server; server uploads to Arweave, then we resolve at 100%
        getProgress(Math.round((e.loaded / e.total) * 95))
      }
    })

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText) as { uri: string }
          getProgress(100)
          resolve(data.uri)
        } catch {
          reject(new Error('Invalid response from upload server'))
        }
      } else {
        try {
          const { error } = JSON.parse(xhr.responseText) as { error?: string }
          reject(new Error(error ?? 'Upload failed'))
        } catch {
          reject(new Error(`Upload failed (${xhr.status})`))
        }
      }
    })

    xhr.addEventListener('error', () => reject(new Error('Upload failed')))
    xhr.addEventListener('timeout', () => reject(new Error('Upload timed out')))

    const form = new FormData()
    form.append('file', file)
    xhr.open('POST', '/api/upload')
    xhr.send(form)
  })
}

export default uploadToArweave
