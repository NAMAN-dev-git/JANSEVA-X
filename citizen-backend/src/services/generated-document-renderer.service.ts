import PDFDocument from "pdfkit";

export const COMPLETION_CERTIFICATE_TYPE = "COMPLETION_CERTIFICATE";
export const COMPLETION_TEMPLATE_VERSION = "batch6-v1";
export const DEMO_DOCUMENT_DISCLAIMER = "DEMO / PROTOTYPE - NOT A GOVERNMENT ISSUED OR LEGALLY VALID DOCUMENT";

export interface CompletionCertificateInput {
  applicationNumber: string;
  serviceName: string;
  citizenName: string;
  generatedAt: Date;
}

/** Renders the only Batch 6 server-selected document template. */
export class GeneratedDocumentRendererService {
  async renderCompletionCertificate(input: CompletionCertificateInput): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const document = new PDFDocument({ margin: 56, size: "A4", compress: false, info: { Title: "JANSEVA-X Demo Completion Certificate", Author: "JANSEVA-X" } });
      const chunks: Buffer[] = [];
      document.on("data", (chunk: Buffer) => chunks.push(chunk));
      document.on("error", reject);
      document.on("end", () => resolve(Buffer.concat(chunks)));

      document.fontSize(18).fillColor("#1f2937").text("JANSEVA-X", { align: "center" });
      document.moveDown(0.4).fontSize(15).text("Demo Completion Certificate", { align: "center" });
      document.moveDown(1.4).fontSize(11).fillColor("#111827");
      document.text(`Application number: ${input.applicationNumber}`);
      document.text(`Service: ${input.serviceName}`);
      document.text(`Citizen: ${input.citizenName}`);
      document.text(`Generated at: ${input.generatedAt.toISOString()}`);
      document.moveDown(1.2).text("This record demonstrates the JANSEVA-X completion workflow. It is not evidence of a government decision, credential, signature, or entitlement.");
      document.moveDown(2.5).fontSize(10).fillColor("#b91c1c").text(DEMO_DOCUMENT_DISCLAIMER, { align: "center", underline: true });
      document.end();
    });
  }
}

