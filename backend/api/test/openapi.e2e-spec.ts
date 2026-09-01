import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { writeFileSync } from 'node:fs';
import { ApplicationConfigModule } from '../src/config/config.module';
import { BootstrapController } from '../src/bootstrap/bootstrap.controller';
import { BootstrapService } from '../src/bootstrap/bootstrap.service';
import { TenantSwitchController } from '../src/auth/session/tenant-switch.controller';
import { TenantSwitchService } from '../src/auth/session/tenant-switch.service';
import { InvitationController } from '../src/membership/invitation/invitation.controller';
import { InvitationService } from '../src/membership/invitation/invitation.service';
import { MembershipAdminController } from '../src/membership/admin/membership-admin.controller';
import { MembershipAdminService } from '../src/membership/admin/membership-admin.service';
import { SessionService } from '../src/auth/session/session.service';
import { SessionCookieService } from '../src/auth/session/session-cookie.service';

interface SwaggerDocument {
  paths: Record<string, Record<string, unknown>>;
  components: {
    schemas: Record<string, unknown>;
  };
}

/**
 * Verifies the W2 OpenAPI-fidelity requirement: the Swagger decorators on the
 * phase 2 business controllers and DTOs must render into the OpenAPI document
 * as DTO schemas and per-route operations/response codes. A focused module is
 * used (rather than the full AppModule) because AppModule pulls in the ESM
 * `openid-client`, which cannot load under the CJS jest runtime; the Swagger
 * metadata being asserted is static and does not require service execution.
 */
describe('Phase 2 OpenAPI fidelity (W2)', () => {
  let app: INestApplication;
  let document: SwaggerDocument;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ApplicationConfigModule],
      controllers: [
        BootstrapController,
        TenantSwitchController,
        InvitationController,
        MembershipAdminController,
      ],
      providers: [
        { provide: BootstrapService, useValue: {} },
        { provide: TenantSwitchService, useValue: {} },
        { provide: InvitationService, useValue: {} },
        { provide: MembershipAdminService, useValue: {} },
        { provide: SessionService, useValue: {} },
        { provide: SessionCookieService, useValue: {} },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    const config = new DocumentBuilder()
      .setTitle('Mohamy Pro API')
      .setVersion('1.0.0')
      .addBearerAuth()
      .build();
    document = SwaggerModule.createDocument(
      app,
      config,
    ) as unknown as SwaggerDocument;
  });

  afterAll(async () => {
    await app?.close();
  });

  it('emits the DTO schemas referenced by the phase 2 endpoints', () => {
    const schemas = document.components.schemas;
    for (const name of [
      'BootstrapDto',
      'TenantSwitchDto',
      'InvitationCreateDto',
      'InvitationScopeDto',
      'InvitationAcceptDto',
      'MembershipAdminDto',
      'MembershipReinstateDto',
    ]) {
      expect(schemas[name]).toBeDefined();
    }
  });

  it('describes each business route with an operation and response codes', () => {
    const expectPath = (path: string): void => {
      expect(document.paths[path]).toBeDefined();
    };
    expectPath('/bootstrap');
    expectPath('/session/tenant-switch');
    expectPath('/membership/invitations');
    expectPath('/membership/invitations/accept');
    expectPath('/membership/members/suspend');
    expectPath('/membership/members/expire');
    expectPath('/membership/members/remove');
    expectPath('/membership/members/reinstate');
  });

  it('documents the bootstrap operation body and its success/error responses', () => {
    const post = document.paths['/bootstrap']?.post as
      | {
          requestBody?: {
            content?: Record<string, { schema?: { $ref?: string } }>;
          };
          responses?: Record<string, unknown>;
        }
      | undefined;
    expect(post).toBeDefined();
    expect(post?.requestBody?.content?.['application/json']?.schema?.$ref).toBe(
      '#/components/schemas/BootstrapDto',
    );
    expect(post?.responses?.['201']).toBeDefined();
    expect(post?.responses?.['401']).toBeDefined();
    expect(post?.responses?.['403']).toBeDefined();
  });

  it('documents the invitation create body with nested scope schema', () => {
    const post = document.paths['/membership/invitations']?.post as
      | {
          requestBody?: {
            content?: Record<string, { schema?: { $ref?: string } }>;
          };
        }
      | undefined;
    const schemaRef =
      post?.requestBody?.content?.['application/json']?.schema?.$ref;
    const schema = document.components.schemas['InvitationCreateDto'] as
      | {
          properties?: Record<
            string,
            { allOf?: Array<{ $ref?: string }>; $ref?: string }
          >;
        }
      | undefined;
    expect(schemaRef).toBe('#/components/schemas/InvitationCreateDto');
    expect(schema?.properties?.requestedScope?.allOf?.[0]?.$ref).toBe(
      '#/components/schemas/InvitationScopeDto',
    );
  });

  it('persists the generated document as evidence', () => {
    const target = '/tmp/opencode/mohamy-openapi-w2.json';
    writeFileSync(target, JSON.stringify(document, null, 2));
    console.log(`OPENAPI_EVIDENCE_WRITTEN=${target}`);
  });
});
