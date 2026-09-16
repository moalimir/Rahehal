import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  privateFileRoutes,
  privatePdfMaxBytes,
  apiSchemas,
  fileTargetSchema,
  requestFileUploadSchema,
  completeFileSchema,
  type FileTarget,
  type RequestFileUploadBody,
} from "@rahhal/contracts";
import type { ApiPorts, ProposalCommandContext } from "./ports.js";
import { ApiProblem } from "./errors.js";
import { correlationId } from "./primitives.js";

type FileRequest = { Params: { fileId: string }; Querystring: { token?: string } };
export function registerPrivateFileRoutes(
  app: FastifyInstance,
  ports: ApiPorts,
  authorize: <T>(
    request: FastifyRequest,
    action: string,
    operation: (context: ProposalCommandContext) => Promise<T>,
  ) => Promise<T>,
) {
  const path = (value: string) =>
    value.replace(/:/g, "::").replace("{fileId}", ":fileId(^fil_[A-Za-z0-9][A-Za-z0-9_-]{2,63}$)");
  const service = () => {
    if (!ports.privateFiles)
      throw new ApiProblem(503, "STORAGE", "Private file service is not configured");
    return ports.privateFiles;
  };
  const envelope = <T>(data: T, request: FastifyRequest) => ({
    ok: true,
    data,
    meta: {
      server_time: ports.clock.now().toISOString(),
      correlation_id: correlationId(request),
      ...(data &&
      typeof data === "object" &&
      "file" in data &&
      data.file &&
      typeof data.file === "object" &&
      "version" in data.file
        ? { entity_version: data.file.version }
        : {}),
    },
  });
  app.addContentTypeParser(
    "application/pdf",
    { parseAs: "buffer", bodyLimit: privatePdfMaxBytes },
    (_request, body, done) => done(null, body),
  );
  app.get<{ Querystring: FileTarget }>(
    path(privateFileRoutes.list),
    {
      schema: {
        querystring: fileTargetSchema,
        response: { 200: apiSchemas.PrivateFileListSuccessEnvelope },
      },
    },
    async (request) =>
      authorize(request, "file:list", async (context) =>
        envelope(await service().list(request.query, context), request),
      ),
  );
  app.post<{ Body: RequestFileUploadBody }>(
    path(privateFileRoutes.requestUpload),
    {
      schema: {
        body: requestFileUploadSchema,
        response: { 200: apiSchemas.PrivateFileUploadSuccessEnvelope },
      },
    },
    async (request) =>
      authorize(request, "file:request-upload", async (context) =>
        envelope(await service().request(request.body, context), request),
      ),
  );
  app.put<FileRequest & { Body: Buffer }>(
    path(privateFileRoutes.upload),
    {
      bodyLimit: privatePdfMaxBytes,
      schema: { response: { 200: apiSchemas.PrivateFileMutationSuccessEnvelope } },
    },
    async (request) =>
      authorize(request, "file:upload", async (context) => {
        if (!Buffer.isBuffer(request.body))
          throw new ApiProblem(422, "VALIDATION", "Expected PDF bytes");
        return envelope(
          await service().upload(
            request.params.fileId,
            request.query.token ?? "",
            request.body,
            context,
          ),
          request,
        );
      }),
  );
  app.post<FileRequest & { Body: { expected_version: number } }>(
    path(privateFileRoutes.complete),
    {
      schema: {
        body: completeFileSchema,
        response: { 200: apiSchemas.PrivateFileMutationSuccessEnvelope },
      },
    },
    async (request) =>
      authorize(request, "file:complete", async (context) =>
        envelope(
          await service().complete(request.params.fileId, request.body.expected_version, context),
          request,
        ),
      ),
  );
  app.get<FileRequest>(
    path(privateFileRoutes.file),
    { schema: { response: { 200: apiSchemas.PrivateFileSuccessEnvelope } } },
    async (request) =>
      authorize(request, "file:metadata", async (context) =>
        envelope(await service().get(request.params.fileId, context), request),
      ),
  );
  app.get<FileRequest>(
    path(privateFileRoutes.downloadUrl),
    { schema: { response: { 200: apiSchemas.PrivateFileDownloadSuccessEnvelope } } },
    async (request) =>
      authorize(request, "file:download-url", async (context) =>
        envelope(await service().downloadUrl(request.params.fileId, context), request),
      ),
  );
  app.get<FileRequest>(path(privateFileRoutes.content), async (request, reply) => {
    const file = await authorize(request, "file:download", (context) =>
      service().download(request.params.fileId, request.query.token ?? "", context),
    );
    return reply
      .header("content-type", "application/pdf")
      .header(
        "content-disposition",
        `attachment; filename="attachment.pdf"; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
      )
      .header("x-content-type-options", "nosniff")
      .header("referrer-policy", "no-referrer")
      .header("content-security-policy", "sandbox; default-src 'none'")
      .send(file.content);
  });
}
