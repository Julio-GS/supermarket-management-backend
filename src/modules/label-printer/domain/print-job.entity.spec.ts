import { PrintJob, PrintJobStatus, LabelSnapshot } from "./print-job.entity";

describe("PrintJob (domain entity)", () => {
  describe("LabelSnapshot", () => {
    it("holds immutable product snapshot data", () => {
      const snap = new LabelSnapshot();
      snap.product_id = "abc-123";
      snap.sku = "7791234000001";
      snap.product_name = "Leche Entera 1L";
      snap.sale_price = "1250.50";

      expect(snap.product_id).toBe("abc-123");
      expect(snap.sku).toBe("7791234000001");
      expect(snap.product_name).toBe("Leche Entera 1L");
      expect(snap.sale_price).toBe("1250.50");
    });
  });

  describe("PrintJob", () => {
    it("defaults status to pending", () => {
      const job = new PrintJob();
      expect(job.status).toBe("pending");
    });

    it("supports all lifecycle states", () => {
      const job = new PrintJob();
      job.status = "pending";
      expect(job.status).toBe("pending");

      job.status = "claimed";
      job.claimed_by = "caja-1";
      job.claimed_at = new Date();
      job.lease_expires_at = new Date(Date.now() + 30000);
      expect(job.status).toBe("claimed");
      expect(job.claimed_by).toBe("caja-1");

      job.status = "completed";
      job.completed_at = new Date();
      expect(job.status).toBe("completed");

      job.status = "failed";
      job.failed_at = new Date();
      job.fail_reason = "Printer offline";
      expect(job.status).toBe("failed");
      expect(job.fail_reason).toBe("Printer offline");
    });

    it("carries an idempotency_key for deduplication", () => {
      const job = new PrintJob();
      job.idempotency_key = "req-2026-08-04-001";
      expect(job.idempotency_key).toBe("req-2026-08-04-001");
    });

    it("can hold a complete label snapshot", () => {
      const job = new PrintJob();
      job.id = "job-1";
      job.product_id = "abc-123";
      job.sku = "7791234000001";
      job.product_name = "Leche Entera 1L";
      job.sale_price = "1250.50";
      job.status = "pending";

      // Snapshot fields exist directly on the job
      expect(job.product_id).toBe("abc-123");
      expect(job.sku).toBe("7791234000001");
      expect(job.product_name).toBe("Leche Entera 1L");
      expect(job.sale_price).toBe("1250.50");
    });

    it("has timestamps", () => {
      const job = new PrintJob();
      const now = new Date();
      job.created_at = now;
      job.updated_at = now;
      expect(job.created_at).toBe(now);
      expect(job.updated_at).toBe(now);
    });

    it("defaults source to null (manual)", () => {
      const job = new PrintJob();
      expect(job.source).toBeNull();
    });

    it("accepts source 'auto' for automatic label jobs", () => {
      const job = new PrintJob();
      job.source = "auto";
      expect(job.source).toBe("auto");
    });

    it("supports superseded as a terminal status for stale automatic jobs", () => {
      const job = new PrintJob();
      job.status = "superseded";
      job.failed_at = new Date();
      job.fail_reason = "superseded";
      expect(job.status).toBe("superseded");
      expect(job.fail_reason).toBe("superseded");
    });
  });

  describe("PrintJobStatus", () => {
    it("defines the expected status constants", () => {
      expect(PrintJobStatus.PENDING).toBe("pending");
      expect(PrintJobStatus.CLAIMED).toBe("claimed");
      expect(PrintJobStatus.COMPLETED).toBe("completed");
      expect(PrintJobStatus.FAILED).toBe("failed");
      expect(PrintJobStatus.SUPERSEDED).toBe("superseded");
    });

    it("superseded is a terminal non-claimable status distinct from failed", () => {
      expect(PrintJobStatus.SUPERSEDED).toBe("superseded");
      expect(PrintJobStatus.SUPERSEDED).not.toBe(PrintJobStatus.FAILED);
      expect(PrintJobStatus.SUPERSEDED).not.toBe(PrintJobStatus.PENDING);
      expect(PrintJobStatus.SUPERSEDED).not.toBe(PrintJobStatus.CLAIMED);
      expect(PrintJobStatus.SUPERSEDED).not.toBe(PrintJobStatus.COMPLETED);
    });
  });
});
