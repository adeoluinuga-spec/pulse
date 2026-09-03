import { getSupabase } from "@/lib/supabase";
import type { Employee, Document as EmployeeDocument } from "@/types";

// ── Mappers ───────────────────────────────────────────────────────────────────

function mapEmployee(row: Record<string, unknown>): Partial<Employee> {
  return {
    id: row.id as string,
    name: row.name as string,
    initials: (row.initials as string) ?? "",
    email: row.email as string,
    phone: (row.phone as string) ?? "",
    homeAddress: (row.home_address as string) ?? "",
    department: (row.department as string) ?? "",
    team: (row.team as string) ?? "",
    role: (row.role as string) ?? "",
    lineManagerId: (row.line_manager_id as string) ?? null,
    cadre: (row.cadre as Employee["cadre"]) ?? "entry",
    peopleResponsibility:
      (row.people_responsibility as Employee["peopleResponsibility"]) ?? "none",
    platformRole: (row.platform_role as Employee["platformRole"]) ?? "standard",
    avatarColor: (row.avatar_color as string) ?? "#e8440a",
    joinDate: (row.join_date as string) ?? "",
    employmentType:
      (row.employment_type as Employee["employmentType"]) ?? "full_time",
    performanceScore: (row.performance_score as number) ?? 0,
    consistencyIndex: (row.consistency_index as number) ?? 0,
    peerRating: (row.peer_rating as number) ?? 0,
    weekStreak: (row.week_streak as number) ?? 0,
    badge: (row.badge as Employee["badge"]) ?? "Good Standing",
    band: {
      current: (row.band_current as string) ?? "",
      next: (row.band_next as string) ?? "",
      requirements:
        ((row.band_requirements as { items?: string[] })?.items as string[]) ??
        [],
    },
    compensation:
      (row.compensation as Employee["compensation"]) ??
      ({
        basic: 0,
        housing: 0,
        transport: 0,
        medical: 0,
        otherAllowances: [],
        totalGross: 0,
        bonusStructure: [],
      } as Employee["compensation"]),
    aiRec:
      (row.ai_rec as Employee["aiRec"]) ??
      ({
        recommendation: "good_standing",
        confidence: 0,
        evidence: [],
      } as Employee["aiRec"]),
  };
}

function mapDocument(row: Record<string, unknown>): EmployeeDocument {
  return {
    id: row.id as string,
    name: row.name as string,
    type: (row.doc_type as string) ?? "",
    status: (row.status as EmployeeDocument["status"]) ?? "pending",
    uploadDate: (row.uploaded_at as string)?.slice(0, 10) ?? "",
    size: undefined,
  };
}

// ── API functions ─────────────────────────────────────────────────────────────

export async function getMyProfile(): Promise<Employee | null> {
  try {
    const supabase = getSupabase();
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();
    if (!authUser) return null;

    // Try by user_id first, fall back to email match (handles edge cases)
    let { data } = await supabase
      .from("employees")
      .select("*")
      .eq("user_id", authUser.id)
      .maybeSingle();

    if (!data && authUser.email) {
      const result = await supabase
        .from("employees")
        .select("*")
        .eq("email", authUser.email)
        .maybeSingle();
      data = result.data;

      // Link user_id if found by email
      if (data) {
        const emp = data as Record<string, unknown>;
        await supabase
          .from("employees")
          .update({ user_id: authUser.id })
          .eq("id", emp.id as string);
      }
    }

    if (!data) return null;

    const partial = mapEmployee(data as Record<string, unknown>);

    return {
      ...partial,
      // Sub-entities are loaded by their own API calls; start empty for real users
      goals: [],
      kpis: [],
      reports: [],
      appraisalComponents: [],
      trainingSuggestions: [],
      wellbeingHistory: [],
      documents: [],
      leaveBalance: {
        annual: { total: 20, used: 0, remaining: 20 },
        sick: { total: 10, used: 0, remaining: 10 },
        compassionate: { total: 3, used: 0, remaining: 3 },
      },
      leaveHistory: [],
      meetings: [],
      tasks: [],
      notifications: [],
    } as Employee;
  } catch {
    return null;
  }
}

export async function updateProfile(
  data: Partial<{
    phone: string;
    homeAddress: string;
    emergencyContact: Record<string, unknown>;
    nextOfKin: Record<string, unknown>;
    onboardingCompleted: boolean;
  }>,
): Promise<boolean> {
  try {
    const supabase = getSupabase();
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();
    if (!authUser) return false;

    const updates: Record<string, unknown> = {};
    if (data.phone !== undefined) updates.phone = data.phone;
    if (data.homeAddress !== undefined) updates.home_address = data.homeAddress;
    if (data.emergencyContact !== undefined)
      updates.emergency_contact = data.emergencyContact;
    if (data.nextOfKin !== undefined) updates.next_of_kin = data.nextOfKin;
    if (data.onboardingCompleted !== undefined) {
      updates.onboarding_completed = data.onboardingCompleted;
      if (data.onboardingCompleted) updates.onboarding_completed_at = new Date().toISOString();
    }

    const { error } = await supabase
      .from("employees")
      .update(updates)
      .eq("user_id", authUser.id);

    return !error;
  } catch {
    return false;
  }
}

export async function getMyDocuments(
  employeeId?: string,
): Promise<EmployeeDocument[]> {
  try {
    const supabase = getSupabase();
    let id = employeeId;
    if (!id) {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();
      if (!authUser) return [];
      const { data: emp } = await supabase
        .from("employees")
        .select("id")
        .eq("user_id", authUser.id)
        .single();
      id = (emp as { id: string } | null)?.id;
      if (!id) return [];
    }

    const { data, error } = await supabase
      .from("documents")
      .select("*")
      .eq("employee_id", id)
      .order("uploaded_at", { ascending: false });

    if (error || !data?.length) return [];
    return (data as Record<string, unknown>[]).map(mapDocument);
  } catch {
    return [];
  }
}

export async function uploadDocument(
  file: File,
  docType: string,
  employeeId: string,
  orgId: string,
): Promise<string | null> {
  try {
    const supabase = getSupabase();
    const ext = file.name.split(".").pop();
    const path = `${orgId}/${employeeId}/${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("documents")
      .upload(path, file);

    if (uploadError) return null;

    // The documents bucket is private — store the storage path, and mint
    // short-lived signed URLs on demand via getDocumentSignedUrl().
    const { error: dbError } = await supabase.from("documents").insert({
      employee_id: employeeId,
      org_id: orgId,
      name: file.name,
      doc_type: docType,
      file_url: path,
      status: "pending",
    });

    return dbError ? null : path;
  } catch {
    return null;
  }
}

// Mint a short-lived signed URL for a private document.
// Accepts either a storage path (new records) or a legacy full public URL
// (old records), from which the path is extracted.
export async function getDocumentSignedUrl(
  filePathOrUrl: string,
  expiresInSeconds = 3600,
): Promise<string | null> {
  try {
    const marker = "/object/public/documents/";
    const path = filePathOrUrl.includes(marker)
      ? filePathOrUrl.split(marker)[1]
      : filePathOrUrl;

    const { data, error } = await getSupabase()
      .storage.from("documents")
      .createSignedUrl(path, expiresInSeconds);

    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  } catch {
    return null;
  }
}
