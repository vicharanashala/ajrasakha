import { useMutation, useQueryClient } from "@tanstack/react-query";
import { QuestionService } from "../../services/questionService";
import { toast } from "sonner";

const questionService = new QuestionService();

type Role = "gate_keeper" | "auditor";

export const useChangeRoleAssignee = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ["change_role_assignee"],
    mutationFn: async ({
      questionId,
      role,
      userId,
    }: {
      questionId: string;
      role: Role;
      userId: string;
    }) => questionService.changeRoleAssignee(questionId, role, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["question_full_data"] });
      toast.success("Assignment updated successfully");
    },
    onError: (error: any) => {
      toast.error(error?.message || "Failed to update assignment");
    },
  });
};

export const useToggleRoleAllocation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ["toggle_role_allocation"],
    mutationFn: async ({
      questionId,
      role,
      enabled,
    }: {
      questionId: string;
      role: Role;
      enabled: boolean;
    }) => questionService.toggleRoleAllocation(questionId, role, enabled),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["question_full_data"] });
    },
    onError: (error: any) => {
      toast.error(error?.message || "Failed to update auto allocation");
    },
  });
};

export const useRemoveRoleAssignee = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ["remove_role_assignee"],
    mutationFn: async ({
      questionId,
      role,
    }: {
      questionId: string;
      role: Role;
    }) => questionService.removeRoleAssignee(questionId, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["question_full_data"] });
      toast.success("Assignment removed successfully");
    },
    onError: (error: any) => {
      toast.error(error?.message || "Failed to remove assignment");
    },
  });
};
