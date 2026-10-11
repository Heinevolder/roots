"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { confirmTrip, deleteReceipt, updateLine } from "@/lib/receipts";

const changed = () => revalidatePath("/udgifter", "layout");

export async function saveLine(id: number, form: FormData) {
  updateLine(id, String(form.get("item") ?? ""), String(form.get("category") ?? ""));
  changed();
}

export async function confirmAll(tripId: number) {
  confirmTrip(tripId);
  changed();
}

export async function removeReceipt(tripId: number) {
  deleteReceipt(tripId);
  changed();
  redirect("/udgifter");
}
