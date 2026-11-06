export interface AnaraCitation {
  passageNumber: number;
  documentName: string | null;
  documentId: string | null;
  pageNumber: number | null;
  sourcePages: number[];
  passageId: string | null;
}

export interface AnaraDraftResponse {
  answer: string;
  citations: AnaraCitation[];
  note: string;
}

export interface IAnaraService {
  draft(question: string, crop?: string | null, domain?: string | null): Promise<AnaraDraftResponse>;
  getDocumentPdf(documentId: string): Promise<Buffer>;
}

