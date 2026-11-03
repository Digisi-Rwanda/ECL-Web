"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Eye } from "lucide-react";
import { AdminSubNav } from "./AdminSubNav";
import { MembersSection } from "./sections/MembersSection";
import { SegmentsSection } from "./sections/SegmentsSection";
import { CollateralSection } from "./sections/CollateralSection";
import { TenantProfileSection } from "./sections/TenantProfileSection";
import { SaveBar } from "@/components/shared/SaveBar";
import { ToastStack, makeToastId } from "@/components/shared/ToastStack";
import { SkeletonBlock } from "@/components/dashboard/shared/SkeletonBlock";
import { useSession } from "next-auth/react";
import { useApiSession } from "@/hooks/use-api-session";
import { formatRole } from "@/lib/api/mappers";
import {
  fetchMembers,
  fetchTenantInvites,
  fetchSegments,
  fetchCollateral,
  fetchTenantProfile,
  updateTenantProfile,
  closeTenant,
  sendInvite,
  updateMember,
  resendInvite,
  revokeInvite,
  removeMember,
  updateSegment,
  createSegment,
  deleteSegment,
  updateCollateral,
  createCollateral,
  deleteCollateral,
} from "@/lib/api/admin";
import type {
  AdminSection, Member, MemberRole, AdminSegment, CollateralType,
  TenantProfile, ModalKind, ToastItem,
} from "@/lib/admin-types";

interface AdminViewProps {
  userRole?: string;
}

const FADE = {
  hidden:  { opacity: 0, y: 4 },
  visible: { opacity: 1, y: 0 },
  exit:    { opacity: 0 },
};

export function AdminView({ userRole: userRoleProp }: AdminViewProps) {
  const { role, token, tenantId } = useApiSession();
  const { update: updateSession } = useSession();
  const userRole = userRoleProp ?? formatRole(role ?? "administrator");
  const isAdmin = userRole === "Admin" || userRole === "Administrator";

  const [activeSection, setActiveSection] = useState<AdminSection>("members");
  const [members,    setMembers]    = useState<Member[]>([]);
  const [segments,   setSegments]   = useState<AdminSegment[]>([]);
  const [collateral, setCollateral] = useState<CollateralType[]>([]);
  const [profile,    setProfile]    = useState<TenantProfile>({ name: "", reportingCadence: "Monthly", currency: "USD", timezone: "UTC" });
  const [dirtySection, setDirtySection] = useState<AdminSection | null>(null);
  const [modal,    setModal]    = useState<ModalKind>(null);
  const [toasts,   setToasts]   = useState<ToastItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Snapshot for discard
  const snapshots = useRef({ members, segments, collateral, profile });

  const toast = useCallback((message: string, kind: ToastItem["kind"] = "success") => {
    const id = makeToastId();
    setToasts((prev) => [...prev, { id, message, kind }]);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    if (!token || !tenantId) return;
    let cancelled = false;
    (async () => {
      try {
        const [m, invites, s, c, p] = await Promise.all([
          fetchMembers(token, tenantId),
          fetchTenantInvites(token, tenantId),
          fetchSegments(token, tenantId),
          fetchCollateral(token, tenantId),
          fetchTenantProfile(token, tenantId),
        ]);
        if (cancelled) return;
        const mergedMembers = [...m, ...invites.filter((inv) => !m.some((mem) => mem.email === inv.email))];
        setMembers(mergedMembers);
        setSegments(s);
        setCollateral(c);
        setProfile(p);
        snapshots.current = { members: mergedMembers, segments: s, collateral: c, profile: p };
      } catch {
        if (!cancelled) toast("Failed to load admin data.", "danger");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token, tenantId, toast]);

  function markDirty(section: AdminSection) {
    if (dirtySection !== section) {
      snapshots.current = { members, segments, collateral, profile };
      setDirtySection(section);
    }
  }

  async function reloadMembers() {
    if (!token || !tenantId) return;
    const [m, invites] = await Promise.all([
      fetchMembers(token, tenantId),
      fetchTenantInvites(token, tenantId),
    ]);
    const merged = [...m, ...invites.filter((inv) => !m.some((mem) => mem.email === inv.email))];
    setMembers(merged);
    snapshots.current.members = merged;
  }

  async function handleSave() {
    if (!token || !tenantId) return;
    try {
      if (dirtySection === "profile") {
        await updateTenantProfile(token, tenantId, {
          name: profile.name,
          reporting_cadence: profile.reportingCadence.toLowerCase(),
          currency: profile.currency,
          timezone: profile.timezone,
        });
        // The session carries the workspace currency; refresh it so the change shows at once.
        await updateSession({ currency: profile.currency });
      } else if (dirtySection === "segments") {
        const snap = snapshots.current.segments;
        for (const seg of segments) {
          if (seg.id.startsWith("s-")) {
            await createSegment(token, tenantId, { name: seg.name, code: seg.code || undefined });
          } else {
            const orig = snap.find((s) => s.id === seg.id);
            if (
              !orig ||
              orig.name !== seg.name ||
              orig.code !== seg.code ||
              orig.disabled !== seg.disabled
            ) {
              await updateSegment(token, tenantId, seg.id, {
                name: seg.name,
                code: seg.code || undefined,
                is_active: !seg.disabled,
              });
            }
          }
        }
        for (const orig of snap) {
          if (!segments.find((s) => s.id === orig.id) && !orig.id.startsWith("s-")) {
            await deleteSegment(token, tenantId, orig.id);
          }
        }
        const fresh = await fetchSegments(token, tenantId);
        setSegments(fresh);
        snapshots.current.segments = fresh;
      } else if (dirtySection === "collateral") {
        const snap = snapshots.current.collateral;
        for (const item of collateral) {
          if (item.id.startsWith("c-")) {
            await createCollateral(token, tenantId, {
              name: item.name,
              haircut: Number(item.haircut),
              time_to_realize: Number(item.timeToRealize),
            });
          } else {
            const orig = snap.find((c) => c.id === item.id);
            if (
              !orig ||
              orig.name !== item.name ||
              orig.haircut !== item.haircut ||
              orig.timeToRealize !== item.timeToRealize
            ) {
              await updateCollateral(token, tenantId, item.id, {
                name: item.name,
                haircut: Number(item.haircut),
                time_to_realize: Number(item.timeToRealize),
              });
            }
          }
        }
        for (const orig of snap) {
          if (!collateral.find((c) => c.id === orig.id) && !orig.id.startsWith("c-")) {
            await deleteCollateral(token, tenantId, orig.id);
          }
        }
        const fresh = await fetchCollateral(token, tenantId);
        setCollateral(fresh);
        snapshots.current.collateral = fresh;
      }
      setDirtySection(null);
      toast("Changes saved. They apply to future runs.");
    } catch {
      toast("Failed to save changes.", "danger");
    }
  }

  const memberActions = isAdmin && token && tenantId ? {
    onInvite: async (email: string, role: MemberRole) => {
      await sendInvite(token, tenantId, email, role);
      await reloadMembers();
    },
    onRoleChange: async (memberId: string, newRole: MemberRole) => {
      await updateMember(token, tenantId, memberId, { role: newRole });
      await reloadMembers();
    },
    onDisable: async (memberId: string) => {
      await updateMember(token, tenantId, memberId, { status: "disabled" });
      await reloadMembers();
    },
    onEnable: async (memberId: string) => {
      await updateMember(token, tenantId, memberId, { status: "active" });
      await reloadMembers();
    },
    onRemove: async (memberId: string) => {
      await removeMember(token, tenantId, memberId);
      await reloadMembers();
    },
    onResendInvite: async (inviteId: string) => {
      await resendInvite(token, inviteId);
      await reloadMembers();
    },
    onRevokeInvite: async (inviteId: string) => {
      await revokeInvite(token, inviteId);
      await reloadMembers();
    },
  } : undefined;

  function handleDiscard() {
    const s = snapshots.current;
    setMembers([...s.members]);
    setSegments([...s.segments]);
    setCollateral([...s.collateral]);
    setProfile({ ...s.profile });
    setDirtySection(null);
    toast("Changes discarded.", "info");
  }

  function handleSectionChange(section: AdminSection) {
    setActiveSection(section);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (isLoading) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
        <div className="page-head">
          <div><SkeletonBlock height={28} width={120} /></div>
        </div>
        <div className="admin-wrap">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[...Array(4)].map((_, i) => <SkeletonBlock key={i} height={38} />)}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <SkeletonBlock height={60} />
            {[...Array(5)].map((_, i) => <SkeletonBlock key={i} height={52} className="skel-row" />)}
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      data-role={isAdmin ? "admin" : "viewer"}
    >
      {/* Page header */}
      <div className="page-head" style={{ marginBottom: "var(--sp-4)" }}>
        <div>
          <h1>Admin</h1>
          <div className="ph-sub">
            <span>{profile.name || "Workspace"}</span>
            <span style={{ color: "var(--text-subtle)" }}>·</span>
            <span>Manage your workspace</span>
          </div>
        </div>
      </div>

      {/* Viewer readonly note */}
      {!isAdmin && (
        <div className="readonly-note">
          <Eye size={14} className="ic" aria-hidden />
          You're viewing as an <strong style={{ marginLeft: 3 }}>{userRole}</strong> — Admin settings are read-only. Ask a Tenant Admin to make changes.
        </div>
      )}

      <div className="admin-wrap">
        <AdminSubNav
          activeSection={activeSection}
          members={members}
          segments={segments}
          collateral={collateral}
          onChange={handleSectionChange}
        />

        <div className="admin-content">
          <AnimatePresence mode="wait">
            {activeSection === "members" && (
              <motion.div key="members" variants={FADE} initial="hidden" animate="visible" exit="exit" transition={{ duration: 0.15 }}>
                <MembersSection
                  members={members}
                  tenantName={profile.name}
                  onUpdate={setMembers}
                  onToast={toast}
                  actions={memberActions}
                />
              </motion.div>
            )}
            {activeSection === "segments" && (
              <motion.div key="segments" variants={FADE} initial="hidden" animate="visible" exit="exit" transition={{ duration: 0.15 }}>
                <SegmentsSection
                  segments={segments}
                  modal={modal}
                  onUpdate={setSegments}
                  onMarkDirty={() => markDirty("segments")}
                  onToast={toast}
                  onSetModal={setModal}
                />
              </motion.div>
            )}
            {activeSection === "collateral" && (
              <motion.div key="collateral" variants={FADE} initial="hidden" animate="visible" exit="exit" transition={{ duration: 0.15 }}>
                <CollateralSection
                  collateral={collateral}
                  modal={modal}
                  onUpdate={setCollateral}
                  onMarkDirty={() => markDirty("collateral")}
                  onToast={toast}
                  onSetModal={setModal}
                />
              </motion.div>
            )}
            {activeSection === "profile" && (
              <motion.div key="profile" variants={FADE} initial="hidden" animate="visible" exit="exit" transition={{ duration: 0.15 }}>
                <TenantProfileSection
                  profile={profile}
                  modal={modal}
                  onUpdate={setProfile}
                  onMarkDirty={() => markDirty("profile")}
                  onToast={toast}
                  onSetModal={setModal}
                  onCloseTenant={
                    isAdmin && token && tenantId
                      ? async () => {
                          await closeTenant(token, tenantId);
                          toast("Closure request submitted.");
                        }
                      : undefined
                  }
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Save bar */}
      <SaveBar
        visible={dirtySection !== null}
        message={`You have unsaved changes in ${dirtySection}.`}
        onSave={handleSave}
        onDiscard={handleDiscard}
      />

      {/* Toast stack */}
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </motion.div>
  );
}
