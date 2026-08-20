import type {
  ApiAttachment,
  AttachmentCapability,
  InitiateAttachmentUploadInput,
  InitiateAttachmentUploadResult,
} from './contracts'
import { ApiError, apiRequest, resolveApiCapabilityUrl } from './http-client'

type AttachmentResponse = ApiAttachment & {
  uploadedByUserId?: string | null
  analysisEligible?: boolean
}

type InitiateResponse = Omit<InitiateAttachmentUploadResult, 'attachment'> & {
  attachment: AttachmentResponse
}

const attachmentsPath = (requestId: string) => (
  `/requests/${encodeURIComponent(requestId)}/attachments`
)
const attachmentPath = (requestId: string, attachmentId: string) => (
  `${attachmentsPath(requestId)}/${encodeURIComponent(attachmentId)}`
)

function toAttachment(response: AttachmentResponse): ApiAttachment {
  return {
    id: response.id,
    requestId: response.requestId,
    requestItemId: response.requestItemId,
    fileName: response.fileName,
    mimeType: response.mimeType,
    sizeBytes: response.sizeBytes,
    status: response.status,
    version: response.version,
    createdAt: response.createdAt,
    updatedAt: response.updatedAt,
  }
}

export async function uploadAttachmentBinary(capabilityUrl: string, file: File): Promise<void> {
  const response = await fetch(resolveApiCapabilityUrl(capabilityUrl), {
    method: 'PUT',
    credentials: 'omit',
    headers: { 'Content-Type': file.type },
    body: file,
  })
  if (!response.ok) {
    throw new ApiError(response.status, `Dosya aktarimi basarisiz (${response.status})`)
  }
}

export const attachmentsApi = {
  initiateUpload: async (requestId: string, input: InitiateAttachmentUploadInput) => {
    const result = await apiRequest<InitiateResponse>(`${attachmentsPath(requestId)}/upload-init`, {
      method: 'POST',
      body: input,
    })
    return { attachment: toAttachment(result.attachment), upload: result.upload }
  },
  list: async (requestId: string) => {
    const result = await apiRequest<AttachmentResponse[]>(attachmentsPath(requestId))
    return result.map(toAttachment)
  },
  get: async (requestId: string, attachmentId: string) => {
    const result = await apiRequest<AttachmentResponse>(attachmentPath(requestId, attachmentId))
    return toAttachment(result)
  },
  getDownload: (requestId: string, attachmentId: string) => (
    apiRequest<AttachmentCapability>(`${attachmentPath(requestId, attachmentId)}/download`)
  ),
  completeUpload: async (requestId: string, attachmentId: string, version: number) => {
    const result = await apiRequest<AttachmentResponse>(`${attachmentPath(requestId, attachmentId)}/upload-complete`, {
      method: 'POST',
      body: { version },
    })
    return toAttachment(result)
  },
  delete: async (requestId: string, attachmentId: string, version: number) => {
    const result = await apiRequest<AttachmentResponse>(attachmentPath(requestId, attachmentId), {
      method: 'DELETE',
      body: { version },
    })
    return toAttachment(result)
  },
}