import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { generateContractHtml } from "@/lib/contract-html";
import type { CalculationResult } from "@/lib/types";
import type { Metadata } from "next";
import { SignSection } from "./sign-section";
import { CheckCircle2 } from "lucide-react";

export const metadata: Metadata = {
  title: "Договор",
};

export default async function ContractPublicPage({
  params,
}: {
  params: Promise<{ publicId: string }>;
}) {
  const { publicId } = await params;

  const estimate = await prisma.estimate.findUnique({
    where: { contractPublicId: publicId },
    include: {
      master: {
        select: {
          firstName: true,
          lastName: true,
          companyName: true,
          phone: true,
          whatsappPhone: true,
          address: true,
          contractType: true,
          bin: true,
          iin: true,
          legalName: true,
          legalAddress: true,
          bankName: true,
          iban: true,
          kbe: true,
          bik: true,
          passportData: true,
          prepaymentPercent: true,
          warrantyMaterials: true,
          warrantyInstall: true,
          contractCity: true,
        },
      },
    },
  });

  if (!estimate) notFound();

  const calc = estimate.calculationData as unknown as CalculationResult;
  const html = generateContractHtml(
    estimate.master,
    {
      publicId: estimate.publicId,
      clientName: estimate.clientName,
      clientPhone: estimate.clientPhone,
      clientAddress: estimate.clientAddress,
      total: estimate.total,
      createdAt: estimate.createdAt,
    },
    calc,
  );

  const isSigned = !!estimate.contractSignedAt;

  return (
    <div className="min-h-screen bg-gray-100">
      {isSigned && (
        <div className="sticky top-0 z-10 bg-emerald-600 text-white">
          <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 flex-shrink-0" />
            <div className="text-sm">
              <span className="font-semibold">Договор подписан</span>
              {" — "}
              {estimate.contractSignerName} ·{" "}
              {estimate.contractSignedAt?.toLocaleString("ru-RU")}
            </div>
          </div>
        </div>
      )}

      <div className="max-w-3xl mx-auto px-3 py-4">
        <div
          className="bg-white shadow-sm rounded-lg overflow-hidden"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>

      <div className="max-w-3xl mx-auto px-3 pb-10">
        {isSigned ? (
          <div className="bg-white rounded-lg shadow-sm p-6 text-center">
            <CheckCircle2 className="h-12 w-12 text-emerald-600 mx-auto mb-3" />
            <h2 className="text-lg font-bold mb-1">Договор подписан</h2>
            <p className="text-sm text-muted-foreground">
              <strong>{estimate.contractSignerName}</strong>
              {estimate.contractSignerPassport
                ? `, удостоверение ${estimate.contractSignerPassport}`
                : ""}
              <br />
              {estimate.contractSignedAt?.toLocaleString("ru-RU")}
            </p>
          </div>
        ) : (
          <SignSection publicId={publicId} />
        )}
      </div>
    </div>
  );
}
