from dataclasses import dataclass
from typing import Any, Annotated

from fastapi import APIRouter, Depends, FastAPI, HTTPException, Request, Response, status
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, Field, RootModel

from chronicle.application.services import (
    BoardService,
    ChronicleQueryService,
    NotFoundError,
    RecordService,
    RelationshipService,
    SessionService,
    TagService,
    ValidationError,
)
from chronicle.config import Settings
from chronicle.domain.models import EntityRef, EntityType
from chronicle.domain.policies import CoterieDispositionPolicy, RelationshipLabelPolicy
from chronicle.infrastructure.mappers import create_default_mapper_registry
from chronicle.infrastructure.sqlite import SQLiteDatabase, SqliteUnitOfWork


class LoginRequest(BaseModel):
    password: str


class RecordPayload(RootModel[dict[str, Any]]):
    pass


class RelationshipPayload(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    source_type: str | None = Field(default=None, alias="sourceType")
    source_id: str | None = Field(default=None, alias="sourceId")
    target_type: str | None = Field(default=None, alias="targetType")
    target_id: str | None = Field(default=None, alias="targetId")
    relation_label: str | None = Field(default=None, alias="relationLabel")
    notes: str | None = None
    edge_color: str | None = Field(default=None, alias="edgeColor")
    arrow_direction: str | None = Field(default=None, alias="arrowDirection")
    line_style: str | None = Field(default=None, alias="lineStyle")

    def as_payload(self) -> dict[str, Any]:
        return self.model_dump(by_alias=True, exclude_none=True)


class TagPayload(BaseModel):
    name: str
    description: str = ""
    recommended: bool = True


class TagChangePayload(BaseModel):
    source: str
    target: str


@dataclass(slots=True)
class ServiceContainer:
    settings: Settings
    records: RecordService
    boards: BoardService
    relationships: RelationshipService
    queries: ChronicleQueryService
    sessions: SessionService
    tags: TagService


def build_container(settings: Settings) -> ServiceContainer:
    database = SQLiteDatabase(settings.database_path)
    database.initialize()
    mappers = create_default_mapper_registry()

    def uow_factory() -> SqliteUnitOfWork:
        return SqliteUnitOfWork(database, mappers)

    records = RecordService(uow_factory, mappers, CoterieDispositionPolicy())
    relationships = RelationshipService(uow_factory, RelationshipLabelPolicy())
    return ServiceContainer(
        settings=settings,
        records=records,
        boards=BoardService(records),
        relationships=relationships,
        queries=ChronicleQueryService(records, relationships),
        sessions=SessionService(uow_factory, settings.password, settings.session_days),
        tags=TagService(uow_factory, mappers, records),
    )


def _entity_type(value: str) -> EntityType:
    try:
        return EntityType(value)
    except ValueError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Неизвестный тип сущности.") from exc


def _is_https(request: Request) -> bool:
    return request.url.scheme == "https" or request.headers.get(
        "x-forwarded-proto", ""
    ).split(",")[0].strip() == "https"


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings.from_environment()
    container = build_container(settings)
    app = FastAPI(
        title="Veerhau's Companion API",
        version="2.0.0",
        docs_url="/api/docs",
        openapi_url="/api/openapi.json",
    )
    app.state.services = container

    @app.exception_handler(NotFoundError)
    async def not_found_handler(_: Request, exc: NotFoundError) -> JSONResponse:
        return JSONResponse({"error": str(exc)}, status_code=status.HTTP_404_NOT_FOUND)

    @app.exception_handler(ValidationError)
    async def validation_handler(_: Request, exc: ValidationError) -> JSONResponse:
        return JSONResponse({"error": str(exc)}, status_code=status.HTTP_400_BAD_REQUEST)

    def services(request: Request) -> ServiceContainer:
        return request.app.state.services

    def require_auth(
        request: Request,
        service_container: Annotated[ServiceContainer, Depends(services)],
    ) -> None:
        if not service_container.sessions.authenticated(request.cookies.get("vc_session")):
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Требуется пароль.")

    Auth = Annotated[None, Depends(require_auth)]
    Services = Annotated[ServiceContainer, Depends(services)]

    v1 = APIRouter(prefix="/api/v1")

    @v1.get("/session")
    def session_state(request: Request, service_container: Services) -> dict[str, bool]:
        return {
            "authenticated": service_container.sessions.authenticated(
                request.cookies.get("vc_session")
            )
        }

    @v1.post("/session")
    def login(
        payload: LoginRequest,
        request: Request,
        response: Response,
        service_container: Services,
    ) -> dict[str, bool]:
        token = service_container.sessions.login(payload.password)
        response.set_cookie(
            "vc_session",
            token.value,
            max_age=service_container.settings.session_days * 86400,
            httponly=True,
            samesite="lax",
            secure=_is_https(request),
            path="/",
        )
        return {"ok": True}

    @v1.delete("/session")
    def logout(
        request: Request,
        response: Response,
        service_container: Services,
    ) -> dict[str, bool]:
        service_container.sessions.logout(request.cookies.get("vc_session"))
        response.delete_cookie("vc_session", path="/")
        return {"ok": True}

    @v1.get("/bootstrap", dependencies=[Depends(require_auth)])
    def bootstrap(service_container: Services) -> dict[str, Any]:
        return service_container.queries.bootstrap()

    @v1.get("/records/{entity}", dependencies=[Depends(require_auth)])
    def list_records(entity: str, service_container: Services) -> list[dict[str, Any]]:
        return service_container.records.list(_entity_type(entity))

    @v1.post(
        "/records/{entity}",
        dependencies=[Depends(require_auth)],
        status_code=status.HTTP_201_CREATED,
    )
    def create_record(
        entity: str, payload: RecordPayload, service_container: Services
    ) -> dict[str, Any]:
        return service_container.records.create(_entity_type(entity), payload.root)

    @v1.get("/records/{entity}/{record_id}", dependencies=[Depends(require_auth)])
    def get_record(entity: str, record_id: str, service_container: Services) -> dict[str, Any]:
        return service_container.records.get(EntityRef(_entity_type(entity), record_id))

    @v1.patch("/records/{entity}/{record_id}", dependencies=[Depends(require_auth)])
    @v1.put("/records/{entity}/{record_id}", dependencies=[Depends(require_auth)])
    def update_record(
        entity: str,
        record_id: str,
        payload: RecordPayload,
        service_container: Services,
    ) -> dict[str, Any]:
        return service_container.records.update(
            EntityRef(_entity_type(entity), record_id), payload.root
        )

    @v1.delete("/records/{entity}/{record_id}", dependencies=[Depends(require_auth)])
    def delete_record(entity: str, record_id: str, service_container: Services) -> dict[str, bool]:
        service_container.records.delete(EntityRef(_entity_type(entity), record_id))
        return {"ok": True}

    @v1.get("/tags", dependencies=[Depends(require_auth)])
    def list_tags(service_container: Services) -> list[dict[str, Any]]:
        return service_container.tags.list()

    @v1.post("/tags", dependencies=[Depends(require_auth)], status_code=status.HTTP_201_CREATED)
    def create_tag(payload: TagPayload, service_container: Services) -> dict[str, Any]:
        return service_container.tags.add(payload.model_dump())

    @v1.post("/tags/rename", dependencies=[Depends(require_auth)])
    def rename_tag(payload: TagChangePayload, service_container: Services) -> dict[str, Any]:
        return service_container.tags.rename(payload.source, payload.target, merge=False)

    @v1.post("/tags/merge", dependencies=[Depends(require_auth)])
    def merge_tag(payload: TagChangePayload, service_container: Services) -> dict[str, Any]:
        return service_container.tags.rename(payload.source, payload.target, merge=True)

    @v1.get("/boards", dependencies=[Depends(require_auth)])
    def list_boards(service_container: Services) -> list[dict[str, Any]]:
        return service_container.boards.list()

    @v1.post(
        "/boards",
        dependencies=[Depends(require_auth)],
        status_code=status.HTTP_201_CREATED,
    )
    def create_board(payload: RecordPayload, service_container: Services) -> dict[str, Any]:
        return service_container.boards.create(payload.root)

    @v1.get("/boards/{board_id}", dependencies=[Depends(require_auth)])
    def get_board(board_id: str, service_container: Services) -> dict[str, Any]:
        return service_container.boards.get(board_id)

    @v1.patch("/boards/{board_id}", dependencies=[Depends(require_auth)])
    @v1.put("/boards/{board_id}", dependencies=[Depends(require_auth)])
    def update_board(
        board_id: str, payload: RecordPayload, service_container: Services
    ) -> dict[str, Any]:
        return service_container.boards.update(board_id, payload.root)

    @v1.delete("/boards/{board_id}", dependencies=[Depends(require_auth)])
    def delete_board(board_id: str, service_container: Services) -> dict[str, bool]:
        service_container.boards.delete(board_id)
        return {"ok": True}

    @v1.get("/relationships", dependencies=[Depends(require_auth)])
    def list_relationships(service_container: Services) -> list[dict[str, Any]]:
        return service_container.relationships.list()

    @v1.post("/relationships", dependencies=[Depends(require_auth)])
    def upsert_relationship(
        payload: RelationshipPayload,
        response: Response,
        service_container: Services,
    ) -> dict[str, Any]:
        result, created = service_container.relationships.upsert(payload.as_payload())
        response.status_code = status.HTTP_201_CREATED if created else status.HTTP_200_OK
        return result

    @v1.get("/relationships/{relationship_id}", dependencies=[Depends(require_auth)])
    def get_relationship(relationship_id: str, service_container: Services) -> dict[str, Any]:
        return service_container.relationships.get(relationship_id)

    @v1.patch("/relationships/{relationship_id}", dependencies=[Depends(require_auth)])
    @v1.put("/relationships/{relationship_id}", dependencies=[Depends(require_auth)])
    def update_relationship(
        relationship_id: str,
        payload: RelationshipPayload,
        service_container: Services,
    ) -> dict[str, Any]:
        return service_container.relationships.update(
            relationship_id, payload.as_payload()
        )

    @v1.delete("/relationships/{relationship_id}", dependencies=[Depends(require_auth)])
    def delete_relationship(relationship_id: str, service_container: Services) -> dict[str, bool]:
        service_container.relationships.delete(relationship_id)
        return {"ok": True}

    app.include_router(v1)

    legacy = APIRouter(prefix="/api")

    @legacy.get("/session")
    def legacy_session(request: Request, service_container: Services) -> dict[str, bool]:
        return session_state(request, service_container)

    @legacy.post("/login")
    def legacy_login(
        payload: LoginRequest,
        request: Request,
        response: Response,
        service_container: Services,
    ) -> dict[str, bool]:
        return login(payload, request, response, service_container)

    @legacy.post("/logout")
    def legacy_logout(
        request: Request,
        response: Response,
        service_container: Services,
    ) -> dict[str, bool]:
        return logout(request, response, service_container)

    @legacy.get("/bootstrap", dependencies=[Depends(require_auth)])
    def legacy_bootstrap(service_container: Services) -> dict[str, Any]:
        return service_container.queries.bootstrap()

    @legacy.get("/relationships", dependencies=[Depends(require_auth)])
    def legacy_relationships(service_container: Services) -> list[dict[str, Any]]:
        return service_container.relationships.list()

    @legacy.post("/relationships", dependencies=[Depends(require_auth)])
    def legacy_create_relationship(
        payload: RelationshipPayload,
        response: Response,
        service_container: Services,
    ) -> dict[str, Any]:
        return upsert_relationship(payload, response, service_container)

    @legacy.get("/relationships/{relationship_id}", dependencies=[Depends(require_auth)])
    def legacy_get_relationship(relationship_id: str, service_container: Services) -> dict[str, Any]:
        return service_container.relationships.get(relationship_id)

    @legacy.put("/relationships/{relationship_id}", dependencies=[Depends(require_auth)])
    def legacy_update_relationship(
        relationship_id: str,
        payload: RelationshipPayload,
        service_container: Services,
    ) -> dict[str, Any]:
        return service_container.relationships.update(
            relationship_id, payload.as_payload()
        )

    @legacy.delete("/relationships/{relationship_id}", dependencies=[Depends(require_auth)])
    def legacy_delete_relationship(relationship_id: str, service_container: Services) -> dict[str, bool]:
        service_container.relationships.delete(relationship_id)
        return {"ok": True}

    @legacy.get("/{entity}", dependencies=[Depends(require_auth)])
    def legacy_list_records(entity: str, service_container: Services) -> list[dict[str, Any]]:
        return service_container.records.list(_entity_type(entity))

    @legacy.post("/{entity}", dependencies=[Depends(require_auth)])
    def legacy_create_record(
        entity: str,
        payload: RecordPayload,
        response: Response,
        service_container: Services,
    ) -> dict[str, Any]:
        response.status_code = status.HTTP_201_CREATED
        return service_container.records.create(_entity_type(entity), payload.root)

    @legacy.get("/{entity}/{record_id}", dependencies=[Depends(require_auth)])
    def legacy_get_record(entity: str, record_id: str, service_container: Services) -> dict[str, Any]:
        return service_container.records.get(EntityRef(_entity_type(entity), record_id))

    @legacy.put("/{entity}/{record_id}", dependencies=[Depends(require_auth)])
    def legacy_update_record(
        entity: str,
        record_id: str,
        payload: RecordPayload,
        service_container: Services,
    ) -> dict[str, Any]:
        return service_container.records.update(
            EntityRef(_entity_type(entity), record_id), payload.root
        )

    @legacy.delete("/{entity}/{record_id}", dependencies=[Depends(require_auth)])
    def legacy_delete_record(entity: str, record_id: str, service_container: Services) -> dict[str, bool]:
        service_container.records.delete(EntityRef(_entity_type(entity), record_id))
        return {"ok": True}

    app.include_router(legacy)

    if settings.static_dir.exists():
        app.mount("/", StaticFiles(directory=settings.static_dir, html=True), name="frontend")
    return app
