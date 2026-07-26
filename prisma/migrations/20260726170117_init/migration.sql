-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "site" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "canonicalHash" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "companyKey" TEXT NOT NULL,
    "location" TEXT,
    "workMode" TEXT,
    "salaryRaw" TEXT,
    "postedAt" DATETIME,
    "descriptionRaw" TEXT,
    "applyType" TEXT NOT NULL DEFAULT 'unknown',
    "status" TEXT NOT NULL DEFAULT 'DISCOVERED',
    "statusReason" TEXT,
    "discoveredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "MatchScore" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "verdict" TEXT NOT NULL,
    "hasDisqualifier" BOOLEAN NOT NULL DEFAULT false,
    "dimensions" TEXT NOT NULL,
    "reasons" TEXT NOT NULL,
    "missingRequirements" TEXT,
    "model" TEXT NOT NULL,
    "rubricVersion" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "cachedTokens" INTEGER NOT NULL DEFAULT 0,
    "costUsd" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MatchScore_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Application" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PREPARING',
    "mode" TEXT NOT NULL,
    "resumeLabel" TEXT NOT NULL,
    "resumeFile" TEXT NOT NULL,
    "coverLetterPath" TEXT,
    "answersSnapshot" TEXT,
    "screenshotPath" TEXT,
    "confirmationRef" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "preparedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" DATETIME,
    "verifiedAt" DATETIME,
    CONSTRAINT "Application_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AnswerCache" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "questionHash" TEXT NOT NULL,
    "questionText" TEXT NOT NULL,
    "fieldType" TEXT NOT NULL,
    "answerText" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "timesUsed" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "CompanyPolicy" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyKey" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "until" DATETIME,
    "reason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "SiteState" (
    "site" TEXT NOT NULL PRIMARY KEY,
    "lastSuccessfulRunAt" DATETIME,
    "lastRunStartedAt" DATETIME,
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "breakerOpenUntil" DATETIME,
    "sessionValidAt" DATETIME,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Run" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "site" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "trigger" TEXT NOT NULL DEFAULT 'cron',
    "queuedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" DATETIME,
    "finishedAt" DATETIME,
    "stats" TEXT,
    "error" TEXT
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kind" TEXT NOT NULL,
    "jobId" TEXT,
    "runId" TEXT,
    "fromStatus" TEXT,
    "toStatus" TEXT,
    "message" TEXT,
    "data" TEXT,
    CONSTRAINT "Event_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Event_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Job_canonicalHash_key" ON "Job"("canonicalHash");

-- CreateIndex
CREATE INDEX "Job_status_idx" ON "Job"("status");

-- CreateIndex
CREATE INDEX "Job_discoveredAt_idx" ON "Job"("discoveredAt");

-- CreateIndex
CREATE INDEX "Job_companyKey_idx" ON "Job"("companyKey");

-- CreateIndex
CREATE UNIQUE INDEX "Job_site_externalId_key" ON "Job"("site", "externalId");

-- CreateIndex
CREATE INDEX "MatchScore_jobId_idx" ON "MatchScore"("jobId");

-- CreateIndex
CREATE INDEX "MatchScore_createdAt_idx" ON "MatchScore"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Application_jobId_key" ON "Application"("jobId");

-- CreateIndex
CREATE INDEX "Application_status_idx" ON "Application"("status");

-- CreateIndex
CREATE INDEX "Application_submittedAt_idx" ON "Application"("submittedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AnswerCache_questionHash_key" ON "AnswerCache"("questionHash");

-- CreateIndex
CREATE INDEX "AnswerCache_approved_idx" ON "AnswerCache"("approved");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyPolicy_companyKey_key" ON "CompanyPolicy"("companyKey");

-- CreateIndex
CREATE INDEX "Run_status_idx" ON "Run"("status");

-- CreateIndex
CREATE INDEX "Run_site_queuedAt_idx" ON "Run"("site", "queuedAt");

-- CreateIndex
CREATE INDEX "Event_jobId_idx" ON "Event"("jobId");

-- CreateIndex
CREATE INDEX "Event_runId_idx" ON "Event"("runId");

-- CreateIndex
CREATE INDEX "Event_at_idx" ON "Event"("at");

-- CreateIndex
CREATE INDEX "Event_kind_idx" ON "Event"("kind");
