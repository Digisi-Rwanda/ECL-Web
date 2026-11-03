"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { RunDetailHeader } from "./RunDetailHeader";
import { RunDetailKpiStrip } from "./RunDetailKpiStrip";
import { RunDetailTabs } from "./RunDetailTabs";
import { RunActionModal } from "./RunActionModal";
import { useAuthedQuery } from "@/hooks/use-authed-query";
import { useApiSession } from "@/hooks/use-api-session";
import { fetchRun, rerunRun, deleteRun } from "@/lib/api/runs";
import { mapRunDetail } from "@/lib/api/mappers";
import type { ModalKind } from "./RunActionModal";
import type { RunDetail } from "@/lib/runs-types";

const LIVE_STATUSES = new Set(["running", "queued", "pd_running", "lgd_running", "ead_running"]);

interface RunDetailViewProps {
  run: RunDetail;
}

export function RunDetailView({ run }: RunDetailViewProps) {
  const [modalKind, setModalKind] = useState<ModalKind>(null);
  const router = useRouter();
  const { token, tenantId, role } = useApiSession();

  // A draft is unfinished setup: it continues in the wizard (Runs list, Home, re-run all land here).
  const resumeDraft = run.status === "draft" && !!role && role !== "reviewer";
  useEffect(() => {
    if (resumeDraft) router.replace(`/runs/new?run=${encodeURIComponent(run.fullId)}`);
  }, [resumeDraft, run.fullId, router]);

  const liveQuery = useAuthedQuery(
    ["run-detail", tenantId, run.fullId],
    (t, tid) => fetchRun(t, tid, run.fullId).then(mapRunDetail),
    {
      enabled: LIVE_STATUSES.has(run.status),
      staleTime: 0,
      refetchInterval: (query) => {
        const s = query.state.data?.status ?? run.status;
        return LIVE_STATUSES.has(s) ? 3_000 : false;
      },
    },
  );

  const displayRun = liveQuery.data ?? run;

  function openModal(kind: NonNullable<ModalKind>) {
    setModalKind(kind);
  }

  async function handleModalAction(action: "delete" | "rerun" | "restore") {
    setModalKind(null);
    if (!token || !tenantId) return;
    if (action === "rerun") {
      try {
        const newRun = await rerunRun(token, tenantId, run.fullId);
        router.push(`/runs/${newRun.fullId}`);
      } catch {
        // non-fatal — user stays on current page
      }
    } else if (action === "delete") {
      try {
        await deleteRun(token, tenantId, run.fullId);
        router.push("/runs");
      } catch {
        // non-fatal — user stays on current page
      }
    }
  }

  if (resumeDraft) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* Header (back btn, banner, title, meta, actions) */}
      <RunDetailHeader run={displayRun} onOpenModal={openModal} />

      {/* KPI strip */}
      <RunDetailKpiStrip run={displayRun} />

      {/* Tabs */}
      <RunDetailTabs
        run={displayRun}
        onRerun={() => openModal("rerun")}
      />

      {/* Action modal */}
      <RunActionModal
        kind={modalKind}
        onClose={() => setModalKind(null)}
        onAction={handleModalAction}
      />
    </motion.div>
  );
}
