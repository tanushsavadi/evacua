import { NextResponse } from "next/server";
import type { PendingAction } from "@/lib/voice-agent/schemas";
import {
  updatePendingActionStatus,
  validatePendingActionApproval,
} from "@/lib/voice-agent/store";

type ApprovalBody = {
  pendingActionId?: string;
  approvalToken?: string;
};

export async function validateLiveActionApproval(
  body: ApprovalBody,
  allowedTypes: PendingAction["actionType"][],
) {
  if (process.env.EVACUA_REQUIRE_APPROVAL_TOKEN !== "true") {
    return { ok: true as const, mode: "legacy_dashboard_allowed" as const };
  }

  const result = await validatePendingActionApproval({
    pendingActionId: body.pendingActionId,
    approvalToken: body.approvalToken,
    allowedTypes,
  });
  if (!result.ok) return result;
  return { ...result, mode: "approval_token_validated" as const };
}

export function approvalErrorResponse(message: string) {
  return NextResponse.json(
    {
      error: "Approval required",
      message,
    },
    { status: 403 },
  );
}

export async function markApprovedActionExecuted(pendingActionId?: string) {
  if (!pendingActionId) return;
  await updatePendingActionStatus(pendingActionId, "executed");
}
