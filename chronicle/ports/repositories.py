from __future__ import annotations

from typing import Protocol, Self

from chronicle.domain.models import (
    ChronicleEntity,
    EntityRef,
    EntityType,
    Relationship,
)


class RecordRepository(Protocol):
    def find(self, ref: EntityRef) -> ChronicleEntity | None: ...

    def find_all(self, entity_type: EntityType) -> list[ChronicleEntity]: ...

    def save(self, entity: ChronicleEntity) -> ChronicleEntity: ...

    def delete(self, ref: EntityRef) -> bool: ...


class RelationshipRepository(Protocol):
    def find(self, relationship_id: str) -> Relationship | None: ...

    def find_all(self) -> list[Relationship]: ...

    def find_by_pair(
        self,
        source: EntityRef,
        target: EntityRef,
        *,
        exclude_id: str | None = None,
    ) -> Relationship | None: ...

    def save(self, relationship: Relationship) -> Relationship: ...

    def delete(self, relationship_id: str) -> bool: ...

    def delete_for_entity(self, ref: EntityRef) -> None: ...


class SessionRepository(Protocol):
    def save(self, token_hash: str, created_at: str, expires_at: str) -> None: ...

    def find(self, token_hash: str) -> tuple[str, str] | None: ...

    def delete(self, token_hash: str) -> None: ...

    def delete_expired(self, now: str) -> None: ...


class UnitOfWork(Protocol):
    records: RecordRepository
    relationships: RelationshipRepository
    sessions: SessionRepository

    def __enter__(self) -> Self: ...

    def __exit__(self, exc_type: object, exc: object, traceback: object) -> None: ...

    def commit(self) -> None: ...

    def rollback(self) -> None: ...

