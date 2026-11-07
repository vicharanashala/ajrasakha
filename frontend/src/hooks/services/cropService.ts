import { apiFetch } from "../api/api-fetch";
import { env } from "@/config/env";
import { auth } from "@/config/firebase";
import { getIdToken } from "firebase/auth";

const API_BASE_URL = env.apiBaseUrl();

export interface ICropAlias {
  language: string;
  region: string;
  english_representation: string;
  native_representation: string;
  source_link?: string;
  page_number?: string;
  agri_expert?: string;
  remark?: string;
  /** Additional sheet columns from an import, keyed by snake_case header (e.g. "Crop Season" -> crop_season). */
  extra_fields?: Record<string, string>;
}

export interface ICropResponse {
  _id?: string;
  name: string;
  status?: string;
  type?: string;
  /** Optional scientific (binomial) name, e.g. "Oryza sativa". */
  scientificName?: string | null;
  aliases: (ICropAlias | string)[];  // string = legacy format from older crops
  createdBy?: string;
  updatedBy?: string;
  createdAt?: string;
  updatedAt?: string;
  /** Resolved "firstName lastName" for createdBy / updatedBy (populated by the API). */
  createdByName?: string;
  updatedByName?: string;
  crops?: string[];
  /** Public URL of the entry's image, if one has been uploaded. */
  imageUrl?: string | null;
}

export interface ICreateCropPayload {
  name: string;
  status?: string;
  type?: string;
  scientificName?: string;
  aliases?: ICropAlias[];
  crops?: string[];
}

export interface ICreateCropResponse {
  success: boolean;
  message: string;
  data: ICropResponse;
}

export interface IGetAllCropsResponse {
  crops: ICropResponse[];
  totalCount: number;
  totalPages: number;
}

export type AgriTechSort =
  | "name_asc"
  | "name_desc"
  | "updated_desc"
  | "updated_asc"
  | "newest"
  | "oldest";

/** Optional list filters sent as query params; undefined means "no filter". */
export interface AgriTechListFilters {
  aliases?: "with" | "without";
  image?: "with" | "without";
  status?: string;
  language?: string;
  region?: string;
  /** ISO timestamps bounding updatedAt. */
  updatedFrom?: string;
  updatedTo?: string;
}

export interface IUpdateCropPayload {
  name?: string;
  aliases?: (ICropAlias | string)[];
  crops?: string[];
  status?: string;
  /** Send "" to clear the scientific name. */
  scientificName?: string;
}

/** Entry types that bulk upload supports: the crop-side types plus chemical. */
export type CropUploadType = "crop" | "weed" | "pest" | "disease" | "chemical";

export interface IBulkUploadCropResponse {
  success: boolean;
  message: string;
  jobId: string;
  count: number;
  isBulkUpload: true;
}

export interface IBulkJobResult {
  name: string;
  status: string; // created | updated | skipped | failed
  reason: string;
}

export interface IBulkJobStatus {
  id: string;
  totalRows: number;
  totalCrops: number;
  processed: number;
  created: number;
  updated: number;
  status: "running" | "completed" | "failed";
  errors: string[];
  results: IBulkJobResult[];
}

/** One entry of a sheet import: a standardized name plus every vernacular term for it. */
export interface ICropImportEntry {
  name: string;
  scientificName?: string;
  aliases: ICropAlias[];
}

/** An entry that already exists, as returned for the import preview. */
export interface IExistingImportEntry {
  name: string;
  type: string;
  aliases: ICropAlias[];
}

export interface ICropImportResult {
  name: string;
  status: "created" | "updated" | "skipped" | "failed";
  reason: string;
}

export interface ICropImportJob {
  id: string;
  status: "running" | "completed" | "failed";
  total: number;
  processed: number;
  result?: ICropImportResponse;
  error?: string;
}

export interface ICropImportResponse {
  results: ICropImportResult[];
  created: number;
  updated: number;
  skipped: number;
  failed: number;
}

export class CropService {
  private _baseUrl = `${API_BASE_URL}/crops`;

  async createCrop(payload: ICreateCropPayload): Promise<ICreateCropResponse | null> {
    return apiFetch<ICreateCropResponse>(this._baseUrl, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  /**
   * Update a crop. The image is folded into this request (multipart): the crop fields go in
   * a JSON `payload` field, with an optional new `image` file, or `removeImage` to clear it.
   */
  async updateCrop(
    cropId: string,
    payload: IUpdateCropPayload,
    opts?: { image?: File | null; removeImage?: boolean },
  ): Promise<ICreateCropResponse | null> {
    const formData = new FormData();
    formData.append("payload", JSON.stringify(payload));
    if (opts?.image) formData.append("image", opts.image);
    if (opts?.removeImage) formData.append("removeImage", "true");
    return apiFetch<ICreateCropResponse>(`${this._baseUrl}/${cropId}`, {
      method: "PUT",
      body: formData,
    });
  }

  async bulkUploadCrops(file: File, type: CropUploadType): Promise<IBulkUploadCropResponse | null> {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("type", type);
    return apiFetch<IBulkUploadCropResponse>(this._baseUrl, {
      method: "POST",
      body: formData,
    });
  }

  /** Which of these names already exist, with their type and stored aliases. */
  async findImportDuplicates(names: string[]): Promise<{ entries: IExistingImportEntry[] } | null> {
    return apiFetch<{ entries: IExistingImportEntry[] }>(`${this._baseUrl}/import/duplicates`, {
      method: "POST",
      body: JSON.stringify({ names }),
    });
  }

  /** Starts a background import of parsed sheet entries and returns its job id. */
  async startImport(
    type: string,
    entries: ICropImportEntry[],
    fileName?: string,
  ): Promise<{ jobId: string; total: number } | null> {
    return apiFetch<{ jobId: string; total: number }>(`${this._baseUrl}/import`, {
      method: "POST",
      body: JSON.stringify({ type, entries, fileName }),
    });
  }

  /** Progress, and once finished the result, of a sheet import job. */
  async getImportJob(jobId: string): Promise<ICropImportJob | null> {
    return apiFetch<ICropImportJob>(`${this._baseUrl}/import/${encodeURIComponent(jobId)}`);
  }

  async getBulkJobStatus(jobId: string): Promise<IBulkJobStatus | null> {
    return apiFetch<IBulkJobStatus>(`${this._baseUrl}/bulk-status/${jobId}`);
  }

  /** Extensible crop-side categories (weed/pest/disease/…) the UI renders dynamically. */
  async getEntryTypes(): Promise<{ types: string[] } | null> {
    return apiFetch<{ types: string[] }>(`${this._baseUrl}/entry-types`);
  }

  /** Download the AgriTech Management list as Excel. Pass a type to filter
   *  (crop/chemical/weed/pest/disease/custom); omit it to download everything. */
  async downloadList(type?: string): Promise<Blob> {
    const firebaseUser = auth.currentUser;
    if (!firebaseUser) throw new Error("User not authenticated");
    const token = await getIdToken(firebaseUser);
    const qs = type ? `?type=${encodeURIComponent(type)}` : "";
    const response = await fetch(`${this._baseUrl}/download${qs}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new Error(`Failed to download ${type ?? "AgriTech"} list`);
    return response.blob();
  }

  async getAllCrops(query?: {
    search?: string;
    sort?: AgriTechSort;
    page?: number;
    limit?: number;
    type?: string;
    filters?: AgriTechListFilters;
  }): Promise<IGetAllCropsResponse | null> {
    const params = new URLSearchParams();
    if (query?.search) params.append("search", query.search);
    if (query?.sort) params.append("sort", query.sort);
    if (query?.page) params.append("page", query.page.toString());
    if (query?.limit) params.append("limit", query.limit.toString());
    if (query?.type) params.append("type", query.type);
    Object.entries(query?.filters ?? {}).forEach(([key, value]) => {
      if (value) params.append(key, value);
    });

    return apiFetch<IGetAllCropsResponse>(`${this._baseUrl}?${params.toString()}`);
  }

  async getAffectedQuestions(
    cropId: string,
    params?: IGetAffectedQuestionsParams,
  ): Promise<IGetAffectedQuestionsResponse | null> {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set("page", String(params.page));
    if (params?.limit) searchParams.set("limit", String(params.limit));
    if (params?.search && params.search.trim()) searchParams.set("search", params.search.trim());
    const qs = searchParams.toString();
    const url = qs ? `${this._baseUrl}/${cropId}/affected-questions?${qs}` : `${this._baseUrl}/${cropId}/affected-questions`;
    return apiFetch<IGetAffectedQuestionsResponse>(url);
  }

  async deleteOrReassignCrop(cropId: string, payload: IDeleteCropPayload): Promise<IDeleteCropResponse | null> {
    return apiFetch<IDeleteCropResponse>(`${this._baseUrl}/${cropId}`, {
      method: "DELETE",
      body: JSON.stringify(payload),
    });
  }

  async getNormalisedCrops(): Promise<{ crops: ICropResponse[] } | null> {
    return apiFetch<{ crops: ICropResponse[] }>(`${this._baseUrl}/normalised-list`);
  }
}

export interface IAffectedQuestion {
  _id: string;
  question: string;
  status?: string;
  createdAt?: string;
  details?: {
    crop?: string;
    normalised_crop?: string;
    state?: string;
    district?: string;
  };
}

export interface IGetAffectedQuestionsParams {
  page?: number;
  limit?: number;
  search?: string;
}

export interface IGetAffectedQuestionsResponse {
  count: number;
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  cropName: string;
  questions: IAffectedQuestion[];
}

export interface IDeleteCropPayload {
  replacementCropId?: string;
  questionIds?: string[];
  reassignAll?: boolean;
}

export interface IDeleteCropResponse {
  success: boolean;
  message: string;
  cropDeleted: boolean;
  reassignedCount: number;
}
