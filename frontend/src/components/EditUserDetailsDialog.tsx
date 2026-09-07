import React, { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/atoms/dialog";
import { Button } from "@/components/atoms/button";
import { Input } from "@/components/atoms/input";
import { Label } from "@/components/atoms/label";
import { Badge } from "@/components/atoms/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/atoms/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/atoms/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/atoms/tabs";
import { MultiSelect } from "@/components/atoms/MultiSelect";
import { CROPS, pae_domains as DOMAINS } from "@/components/MetaData";
import { useGetStates, useGetDistricts } from "@/hooks/api/location/useLocations";
import { useAdminEditUser } from "@/hooks/api/Admin/useAdminEditUser";
import type { IUser, IUserAdminEdit, IKVKCoveredItem } from "@/types";
import { toast } from "sonner";
import {
  User,
  Mail,
  Phone,
  GraduationCap,
  MapPin,
  Building2,
  Sprout,
  Layers,
  Plus,
  Trash2,
  Camera,
  Loader2,
  ShieldAlert,
  Info,
} from "lucide-react";

interface EditUserDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: IUser | null;
}

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  moderator: "Moderator",
  expert: "Expert",
  pae_expert: "PAE Expert",
  gate_keeper: "Gate Keeper",
  auditor: "Auditor",
  tester: "Tester",
  call_agent: "Call Agent",
  district_coordinator: "District Coordinator",
  block_coordinator: "Block Coordinator",
  village_volunteer: "Village Volunteer",
};

const avatarColors = [
  "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
  "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300",
  "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300",
];

const getColorForUser = (name: string) => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return avatarColors[Math.abs(hash) % avatarColors.length];
};

const toTitleCase = (s: string) =>
  (s ?? "").trim().toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

export const EditUserDetailsDialog: React.FC<EditUserDetailsDialogProps> = ({
  open,
  onOpenChange,
  user,
}) => {
  const [activeTab, setActiveTab] = useState<string>("basic");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [avatar, setAvatar] = useState("");
  const [mobile, setMobile] = useState("");
  const [university, setUniversity] = useState("");

  const [preferenceState, setPreferenceState] = useState("");
  const [preferenceDistrict, setPreferenceDistrict] = useState("");
  const [preferenceCrop, setPreferenceCrop] = useState("");
  const [selectedDomains, setSelectedDomains] = useState<string[]>([]);
  const [customDomainInput, setCustomDomainInput] = useState("");

  const [kvkList, setKvkList] = useState<IKVKCoveredItem[]>([]);
  const [kvkDraft, setKvkDraft] = useState<{ state: string; district: string; name: string }>({
    state: "",
    district: "",
    name: "",
  });

  const [errors, setErrors] = useState<{
    firstName?: string;
    mobile?: string;
    university?: string;
  }>({});

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isProcessingAvatar, setIsProcessingAvatar] = useState(false);

  const { data: statesResponse = [] } = useGetStates();
  const stateOptions = statesResponse.map((s) => s.stateNameEnglish);

  // Preference districts
  const prefStateCode = statesResponse.find(
    (s) => s.stateNameEnglish.toLowerCase() === preferenceState.toLowerCase(),
  )?.stateCode;
  const { data: prefDistricts = [] } = useGetDistricts(prefStateCode);
  const prefDistrictNames = prefDistricts.map((d) => d.districtNameEnglish);

  // KVK draft districts
  const kvkDraftStateCode = statesResponse.find(
    (s) => s.stateNameEnglish.toLowerCase() === kvkDraft.state.toLowerCase(),
  )?.stateCode;
  const { data: kvkDistricts = [] } = useGetDistricts(kvkDraftStateCode);
  const kvkDistrictNames = kvkDistricts.map((d) => d.districtNameEnglish);

  const { mutateAsync: editUser, isPending: isSaving } = useAdminEditUser();

  // Reset form when opening with new user
  useEffect(() => {
    if (user && open) {
      setFirstName(user.firstName || "");
      setLastName(user.lastName || "");
      setAvatar(user.avatar || "");
      setMobile(user.mobile || "");
      setUniversity(user.university || "");

      const pref = user.preference;
      setPreferenceState(pref?.state ?? "");
      setPreferenceDistrict(pref?.district ?? "");
      setPreferenceCrop(
        typeof pref?.crop === "string"
          ? pref.crop
          : (pref?.crop as any)?.name ?? "",
      );

      const rawDomain = pref?.domain;
      if (Array.isArray(rawDomain)) {
        setSelectedDomains(rawDomain.map(String));
      } else if (typeof rawDomain === "string" && rawDomain && rawDomain !== "all") {
        setSelectedDomains([rawDomain]);
      } else {
        setSelectedDomains([]);
      }
      setCustomDomainInput("");

      // Parse KVK items
      const rawKvk = user.kvkCovered as unknown;
      if (Array.isArray(rawKvk)) {
        setKvkList(
          rawKvk
            .map((item: any) =>
              item && typeof item === "object"
                ? {
                    state: item.state ?? "",
                    district: item.district ?? "",
                    name: item.name ?? "",
                  }
                : { state: "", district: "", name: typeof item === "string" ? item : "" },
            )
            .filter((k) => k.name),
        );
      } else {
        setKvkList([]);
      }

      setKvkDraft({ state: "", district: "", name: "" });
      setErrors({});
      setActiveTab("basic");
    }
  }, [user, open]);

  const handleAvatarFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Please upload a valid image file (PNG, JPG, WebP)");
      return;
    }

    if (file.size > 70 * 1024) {
      toast.error("Image size must be less than 70KB");
      return;
    }

    setIsProcessingAvatar(true);
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      setAvatar(base64);
      setIsProcessingAvatar(false);
      toast.success("Avatar image loaded. Click 'Save Changes' to apply.");
    };
    reader.onerror = () => {
      setIsProcessingAvatar(false);
      toast.error("Failed to read image file");
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveAvatar = () => {
    setAvatar("");
    if (fileInputRef.current) fileInputRef.current.value = "";
    toast.info("Avatar removed. Click 'Save Changes' to apply.");
  };

  const handleAddKvk = () => {
    if (!kvkDraft.name.trim()) {
      toast.error("Please enter a KVK name.");
      return;
    }
    const newItem: IKVKCoveredItem = {
      state: toTitleCase(kvkDraft.state),
      district: toTitleCase(kvkDraft.district),
      name: toTitleCase(kvkDraft.name),
    };

    const duplicate = kvkList.some(
      (k) =>
        k.name.toLowerCase() === newItem.name.toLowerCase() &&
        k.state.toLowerCase() === newItem.state.toLowerCase() &&
        k.district.toLowerCase() === newItem.district.toLowerCase(),
    );

    if (duplicate) {
      toast.error("This KVK is already in the list.");
      return;
    }

    setKvkList((prev) => [...prev, newItem]);
    setKvkDraft({ state: "", district: "", name: "" });
  };

  const handleRemoveKvk = (index: number) => {
    setKvkList((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAddCustomDomain = () => {
    const trimmed = customDomainInput.trim();
    if (!trimmed) return;
    if (selectedDomains.includes(trimmed)) {
      toast.error("Domain already added");
      return;
    }
    setSelectedDomains((prev) => [...prev, trimmed]);
    setCustomDomainInput("");
  };

  const validateForm = () => {
    const newErrors: { firstName?: string; mobile?: string; university?: string } = {};

    if (!firstName.trim()) {
      newErrors.firstName = "First name is required.";
    }

    if (mobile.trim()) {
      // Basic international phone format regex
      if (!/^\+?[\d\s-]{7,16}$/.test(mobile.trim())) {
        newErrors.mobile = "Please enter a valid phone number (e.g., +91 9876543210).";
      }
    }

    if (university.trim() && university.trim().length < 2) {
      newErrors.university = "University/Institution must have at least 2 characters.";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!user?._id) return;

    if (!validateForm()) {
      toast.error("Please check the form for errors.");
      return;
    }

    const payload: IUserAdminEdit = {
      firstName: firstName.trim(),
      lastName: lastName.trim() || undefined,
      avatar: avatar || undefined,
      mobile: mobile.trim() || undefined,
      university: university.trim() || undefined,
      preference: {
        state: preferenceState.trim(),
        district: preferenceDistrict.trim() || undefined,
        crop: preferenceCrop.trim(),
        domain: selectedDomains.length > 0 ? selectedDomains : "all",
      },
      kvkCovered: kvkList.length > 0 ? kvkList : null,
    };

    try {
      await editUser({ userId: user._id, data: payload });
      onOpenChange(false);
    } catch {
      // Error is handled in useAdminEditUser hook
    }
  };

  if (!user) return null;

  const fullName = `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email;
  const avatarBg = getColorForUser(fullName);
  const initials = `${firstName?.[0] ?? ""}${lastName?.[0] ?? ""}`.toUpperCase() || "U";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:max-w-[650px] md:max-w-[760px] p-0 overflow-hidden bg-card border shadow-2xl rounded-xl">
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border-b px-6 py-5">
          <DialogHeader>
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <Avatar className={`h-12 w-12 border-2 border-background shadow-sm ${avatarBg}`}>
                  <AvatarImage src={avatar} alt={fullName} />
                  <AvatarFallback className="text-base font-bold">{initials}</AvatarFallback>
                </Avatar>
                <div>
                  <DialogTitle className="text-xl font-bold flex items-center gap-2 text-foreground">
                    <span>Edit User Details</span>
                    <Badge variant="outline" className="font-medium text-xs px-2 py-0.5 capitalize">
                      {ROLE_LABELS[user.role] || user.role}
                    </Badge>
                  </DialogTitle>
                  <DialogDescription className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                    <Mail className="w-3 h-3 shrink-0" />
                    <span>{user.email}</span>
                  </DialogDescription>
                </div>
              </div>
              <div className="hidden sm:flex flex-col items-end gap-1">
                <Badge
                  variant={user.status === "in-active" ? "destructive" : "secondary"}
                  className="text-[11px] font-semibold"
                >
                  {user.status === "in-active" ? "Inactive" : "Active"}
                </Badge>
              </div>
            </div>
          </DialogHeader>
        </div>

        {/* Tabs and Form Content */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col">
          <div className="px-6 pt-3 border-b bg-muted/20">
            <TabsList className="grid grid-cols-3 w-full bg-muted/60 p-1">
              <TabsTrigger value="basic" className="flex items-center gap-1.5 text-xs sm:text-sm">
                <User className="w-4 h-4 shrink-0" />
                <span>Basic Profile</span>
              </TabsTrigger>
              <TabsTrigger value="preferences" className="flex items-center gap-1.5 text-xs sm:text-sm">
                <MapPin className="w-4 h-4 shrink-0" />
                <span>Preferences</span>
              </TabsTrigger>
              <TabsTrigger value="kvks" className="flex items-center gap-1.5 text-xs sm:text-sm">
                <Building2 className="w-4 h-4 shrink-0" />
                <span>KVK Covered</span>
                {kvkList.length > 0 && (
                  <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0 h-4">
                    {kvkList.length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Form Body with Scroll */}
          <div className="max-h-[60vh] overflow-y-auto px-6 py-5 space-y-6">
            {/* TAB 1: BASIC PROFILE */}
            <TabsContent value="basic" className="m-0 space-y-5">
              {/* Avatar Section */}
              <div className="rounded-lg border bg-muted/20 p-4">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-3">
                  Profile Picture
                </Label>
                <div className="flex items-center gap-4">
                  <div className="relative group">
                    <Avatar className={`h-16 w-16 border-2 border-primary/20 shadow-sm ${avatarBg}`}>
                      <AvatarImage src={avatar} alt={fullName} />
                      <AvatarFallback className="text-xl font-bold">{initials}</AvatarFallback>
                    </Avatar>
                  </div>
                  <div className="space-y-1.5 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1.5 text-xs font-medium"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isProcessingAvatar}
                      >
                        <Camera className="w-3.5 h-3.5" />
                        <span>{avatar ? "Change Photo" : "Upload Photo"}</span>
                      </Button>
                      {avatar && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 gap-1.5 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={handleRemoveAvatar}
                          disabled={isProcessingAvatar}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Remove</span>
                        </Button>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Max file size: 70KB (PNG, JPG, WebP).
                    </p>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleAvatarFileChange}
                    />
                  </div>
                </div>
              </div>

              {/* Name Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="edit-first-name" className="text-xs font-semibold">
                    First Name <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="edit-first-name"
                    value={firstName}
                    onChange={(e) => {
                      setFirstName(e.target.value);
                      if (errors.firstName) setErrors((prev) => ({ ...prev, firstName: undefined }));
                    }}
                    placeholder="Enter first name"
                    className={errors.firstName ? "border-destructive focus-visible:ring-destructive" : ""}
                  />
                  {errors.firstName && (
                    <p className="text-[11px] text-destructive font-medium">{errors.firstName}</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="edit-last-name" className="text-xs font-semibold">
                    Last Name
                  </Label>
                  <Input
                    id="edit-last-name"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Enter last name"
                  />
                </div>
              </div>

              {/* Email (Read Only) */}
              <div className="space-y-1.5">
                <Label htmlFor="edit-email" className="text-xs font-semibold text-muted-foreground">
                  Email Address (Read-only)
                </Label>
                <Input
                  id="edit-email"
                  value={user.email}
                  disabled
                  className="bg-muted/50 text-muted-foreground cursor-not-allowed"
                />
              </div>

              {/* Contact & University Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="edit-mobile" className="text-xs font-semibold flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-muted-foreground" />
                    <span>Mobile Number</span>
                  </Label>
                  <Input
                    id="edit-mobile"
                    value={mobile}
                    onChange={(e) => {
                      setMobile(e.target.value);
                      if (errors.mobile) setErrors((prev) => ({ ...prev, mobile: undefined }));
                    }}
                    placeholder="+91 9876543210"
                    className={errors.mobile ? "border-destructive focus-visible:ring-destructive" : ""}
                  />
                  {errors.mobile && (
                    <p className="text-[11px] text-destructive font-medium">{errors.mobile}</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="edit-university" className="text-xs font-semibold flex items-center gap-1.5">
                    <GraduationCap className="w-3.5 h-3.5 text-muted-foreground" />
                    <span>University / Institution</span>
                  </Label>
                  <Input
                    id="edit-university"
                    value={university}
                    onChange={(e) => {
                      setUniversity(e.target.value);
                      if (errors.university) setErrors((prev) => ({ ...prev, university: undefined }));
                    }}
                    placeholder="e.g. PJTSAU, TNAU, etc."
                    className={errors.university ? "border-destructive focus-visible:ring-destructive" : ""}
                  />
                  {errors.university && (
                    <p className="text-[11px] text-destructive font-medium">{errors.university}</p>
                  )}
                </div>
              </div>
            </TabsContent>

            {/* TAB 2: PREFERENCES */}
            <TabsContent value="preferences" className="m-0 space-y-5">
              <div className="rounded-lg border bg-muted/20 p-3.5 flex items-start gap-2.5">
                <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground">
                  User preferences determine question routing, automated domain matching, and localized workflow visibility.
                </p>
              </div>

              {/* State & District */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="pref-state" className="text-xs font-semibold flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
                    <span>Preference State</span>
                  </Label>
                  <Select
                    value={preferenceState}
                    onValueChange={(val) => {
                      setPreferenceState(val);
                      setPreferenceDistrict("");
                    }}
                  >
                    <SelectTrigger id="pref-state" className="w-full">
                      <SelectValue placeholder="Select State (or All)" />
                    </SelectTrigger>
                    <SelectContent className="max-h-56">
                      <SelectItem value="all">All States</SelectItem>
                      {stateOptions.map((state) => (
                        <SelectItem key={state} value={state}>
                          {state}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="pref-district" className="text-xs font-semibold flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
                    <span>Preference District</span>
                  </Label>
                  <Select
                    value={preferenceDistrict}
                    onValueChange={setPreferenceDistrict}
                    disabled={!preferenceState || preferenceState === "all"}
                  >
                    <SelectTrigger id="pref-district" className="w-full">
                      <SelectValue
                        placeholder={
                          preferenceState === "all" || !preferenceState
                            ? "N/A for All States"
                            : "Select District (or All)"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent className="max-h-56">
                      <SelectItem value="all">All Districts</SelectItem>
                      {prefDistrictNames.map((district) => (
                        <SelectItem key={district} value={district}>
                          {district}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Crop Preference */}
              <div className="space-y-1.5">
                <Label htmlFor="pref-crop" className="text-xs font-semibold flex items-center gap-1.5">
                  <Sprout className="w-3.5 h-3.5 text-muted-foreground" />
                  <span>Crop Expertise</span>
                </Label>
                <Select value={preferenceCrop} onValueChange={setPreferenceCrop}>
                  <SelectTrigger id="pref-crop" className="w-full">
                    <SelectValue placeholder="Select primary crop" />
                  </SelectTrigger>
                  <SelectContent className="max-h-56">
                    <SelectItem value="all">All Crops</SelectItem>
                    {CROPS.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Domain MultiSelect */}
              <div className="space-y-2">
                <Label className="text-xs font-semibold flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-muted-foreground" />
                  <span>Domain Expertise</span>
                </Label>
                <MultiSelect
                  items={DOMAINS.map((d) => ({ value: d, label: d }))}
                  selected={selectedDomains}
                  onChange={setSelectedDomains}
                  placeholder="Select domain(s)..."
                  searchable
                  getDisplayLabel={(sel) =>
                    sel.length === 0
                      ? "All Domains"
                      : sel.length === 1
                        ? sel[0]
                        : `${sel.length} domains selected`
                  }
                />

                {/* Custom domain input */}
                <div className="flex gap-2 pt-1">
                  <Input
                    placeholder="Add custom domain..."
                    value={customDomainInput}
                    onChange={(e) => setCustomDomainInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddCustomDomain();
                      }
                    }}
                    className="text-xs h-8"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={handleAddCustomDomain}
                    className="h-8 text-xs shrink-0"
                  >
                    Add
                  </Button>
                </div>

                {/* Selected domains tags */}
                {selectedDomains.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {selectedDomains.map((domain) => (
                      <Badge
                        key={domain}
                        variant="secondary"
                        className="text-xs pl-2 pr-1 py-0.5 gap-1 flex items-center"
                      >
                        <span className="truncate max-w-[200px]">{domain}</span>
                        <button
                          type="button"
                          onClick={() => setSelectedDomains((prev) => prev.filter((d) => d !== domain))}
                          className="text-muted-foreground hover:text-foreground rounded-full p-0.5"
                        >
                          ✕
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>

            {/* TAB 3: KVK COVERED */}
            <TabsContent value="kvks" className="m-0 space-y-5">
              <div className="rounded-lg border bg-muted/20 p-3.5 flex items-start gap-2.5">
                <Building2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground">
                  Krishi Vigyan Kendras (KVKs) assigned to this user. You can add or remove KVK coverage entries below.
                </p>
              </div>

              {/* Add New KVK Form */}
              <div className="rounded-lg border p-4 bg-card space-y-3">
                <Label className="text-xs font-bold text-foreground">Add New KVK Entry</Label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">State</Label>
                    <Select
                      value={kvkDraft.state}
                      onValueChange={(val) => setKvkDraft((prev) => ({ ...prev, state: val, district: "" }))}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Select State" />
                      </SelectTrigger>
                      <SelectContent className="max-h-56">
                        {stateOptions.map((s) => (
                          <SelectItem key={s} value={s}>
                            {s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">District</Label>
                    <Select
                      value={kvkDraft.district}
                      onValueChange={(val) => setKvkDraft((prev) => ({ ...prev, district: val }))}
                      disabled={!kvkDraft.state}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Select District" />
                      </SelectTrigger>
                      <SelectContent className="max-h-56">
                        {kvkDistrictNames.map((d) => (
                          <SelectItem key={d} value={d}>
                            {d}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">KVK Center Name</Label>
                    <Input
                      placeholder="e.g. KVK Medak"
                      value={kvkDraft.name}
                      onChange={(e) => setKvkDraft((prev) => ({ ...prev, name: e.target.value }))}
                      className="h-8 text-xs"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAddKvk}
                    disabled={!kvkDraft.name.trim()}
                    className="h-8 text-xs gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add to Covered KVKs</span>
                  </Button>
                </div>
              </div>

              {/* Covered KVKs List */}
              <div className="space-y-2">
                <Label className="text-xs font-semibold">
                  Covered KVKs ({kvkList.length})
                </Label>
                {kvkList.length === 0 ? (
                  <div className="text-center py-6 border border-dashed rounded-lg text-muted-foreground text-xs">
                    No KVKs assigned to this user yet.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-52 overflow-y-auto pr-1">
                    {kvkList.map((kvk, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-2.5 rounded-lg border bg-card/60 hover:bg-muted/30 transition-colors"
                      >
                        <div className="min-w-0 pr-2">
                          <p className="text-xs font-semibold truncate text-foreground">{kvk.name}</p>
                          <p className="text-[11px] text-muted-foreground truncate">
                            {[kvk.district, kvk.state].filter(Boolean).join(", ") || "Location unassigned"}
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveKvk(idx)}
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>
          </div>
        </Tabs>

        {/* Modal Footer */}
        <DialogFooter className="px-6 py-4 border-t bg-muted/10 gap-2 sm:gap-0 flex-row justify-end items-center">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
            className="text-xs h-9"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={isSaving || isProcessingAvatar}
            className="text-xs h-9 gap-1.5 ml-2"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Saving Changes...</span>
              </>
            ) : (
              <span>Save Changes</span>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
