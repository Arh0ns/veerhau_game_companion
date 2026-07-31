from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from types import TracebackType
from typing import Self

from chronicle.domain.models import (
    ChronicleEntity,
    EntityRef,
    EntityType,
    RecordEnvelope,
    Relationship,
)
from chronicle.infrastructure.mappers import RecordMapperRegistry
from chronicle.infrastructure.migrations import initialize_database


class SQLiteDatabase:
    def __init__(self, path: Path) -> None:
        self.path = path

    def connect(self) -> sqlite3.Connection:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(self.path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys=ON")
        conn.execute("PRAGMA journal_mode=WAL")
        return conn

    def initialize(self) -> None:
        with self.connect() as conn:
            initialize_database(conn)


class SqliteRecordRepository:
    def __init__(self, conn: sqlite3.Connection, mappers: RecordMapperRegistry) -> None:
        self.conn = conn
        self.mappers = mappers

    @staticmethod
    def _envelope(row: sqlite3.Row) -> RecordEnvelope:
        return RecordEnvelope(
            entity_type=EntityType(row["entity"]),
            id=row["id"],
            payload=json.loads(row["data"]),
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )

    def find(self, ref: EntityRef) -> ChronicleEntity | None:
        row = self.conn.execute(
            "SELECT * FROM records WHERE entity=? AND id=?",
            (ref.entity_type.value, ref.entity_id),
        ).fetchone()
        return self.mappers.from_record(self._envelope(row)) if row else None

    def find_all(self, entity_type: EntityType) -> list[ChronicleEntity]:
        rows = self.conn.execute(
            "SELECT * FROM records WHERE entity=? ORDER BY created_at,id",
            (entity_type.value,),
        ).fetchall()
        return [self.mappers.from_record(self._envelope(row)) for row in rows]

    def save(self, entity: ChronicleEntity) -> ChronicleEntity:
        envelope = self.mappers.to_record(entity)
        self.conn.execute(
            """
            INSERT OR REPLACE INTO records(entity,id,data,created_at,updated_at)
            VALUES (?,?,?,?,?)
            """,
            (
                envelope.entity_type.value,
                envelope.id,
                json.dumps(envelope.payload, ensure_ascii=False, separators=(",", ":")),
                envelope.created_at,
                envelope.updated_at,
            ),
        )
        return entity

    def delete(self, ref: EntityRef) -> bool:
        cursor = self.conn.execute(
            "DELETE FROM records WHERE entity=? AND id=?",
            (ref.entity_type.value, ref.entity_id),
        )
        return cursor.rowcount > 0


def relationship_from_row(row: sqlite3.Row) -> Relationship:
    return Relationship(
        id=row["id"],
        source=EntityRef(EntityType(row["source_type"]), row["source_id"]),
        target=EntityRef(EntityType(row["target_type"]), row["target_id"]),
        relation_label=row["relation_label"],
        notes=row["notes"],
        edge_color=row["edge_color"],
        arrow_direction=row["arrow_direction"],
        line_style=row["line_style"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


class SqliteRelationshipRepository:
    def __init__(self, conn: sqlite3.Connection) -> None:
        self.conn = conn

    def find(self, relationship_id: str) -> Relationship | None:
        row = self.conn.execute(
            "SELECT * FROM relationships WHERE id=?", (relationship_id,)
        ).fetchone()
        return relationship_from_row(row) if row else None

    def find_all(self) -> list[Relationship]:
        rows = self.conn.execute(
            "SELECT * FROM relationships ORDER BY created_at,id"
        ).fetchall()
        return [relationship_from_row(row) for row in rows]

    def find_by_pair(
        self,
        source: EntityRef,
        target: EntityRef,
        *,
        exclude_id: str | None = None,
    ) -> Relationship | None:
        sql = """
            SELECT * FROM relationships
            WHERE ((source_type=? AND source_id=? AND target_type=? AND target_id=?)
               OR (source_type=? AND source_id=? AND target_type=? AND target_id=?))
        """
        params: list[str] = [
            source.entity_type.value,
            source.entity_id,
            target.entity_type.value,
            target.entity_id,
            target.entity_type.value,
            target.entity_id,
            source.entity_type.value,
            source.entity_id,
        ]
        if exclude_id:
            sql += " AND id<>?"
            params.append(exclude_id)
        sql += " ORDER BY created_at,id LIMIT 1"
        row = self.conn.execute(sql, params).fetchone()
        return relationship_from_row(row) if row else None

    def save(self, relationship: Relationship) -> Relationship:
        self.conn.execute(
            """
            INSERT OR REPLACE INTO relationships(
                id,source_type,source_id,target_type,target_id,
                relation_label,notes,edge_color,arrow_direction,line_style,created_at,updated_at
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
            """,
            (
                relationship.id,
                relationship.source.entity_type.value,
                relationship.source.entity_id,
                relationship.target.entity_type.value,
                relationship.target.entity_id,
                relationship.relation_label,
                relationship.notes,
                relationship.edge_color,
                relationship.arrow_direction,
                relationship.line_style,
                relationship.created_at,
                relationship.updated_at,
            ),
        )
        return relationship

    def delete(self, relationship_id: str) -> bool:
        cursor = self.conn.execute(
            "DELETE FROM relationships WHERE id=?", (relationship_id,)
        )
        return cursor.rowcount > 0

    def delete_for_entity(self, ref: EntityRef) -> None:
        self.conn.execute(
            """
            DELETE FROM relationships
            WHERE (source_type=? AND source_id=?) OR (target_type=? AND target_id=?)
            """,
            (
                ref.entity_type.value,
                ref.entity_id,
                ref.entity_type.value,
                ref.entity_id,
            ),
        )


class SqliteSessionRepository:
    def __init__(self, conn: sqlite3.Connection) -> None:
        self.conn = conn

    def save(self, token_hash: str, created_at: str, expires_at: str) -> None:
        self.conn.execute(
            "INSERT OR REPLACE INTO sessions(token_hash,created_at,expires_at) VALUES (?,?,?)",
            (token_hash, created_at, expires_at),
        )

    def find(self, token_hash: str) -> tuple[str, str] | None:
        row = self.conn.execute(
            "SELECT created_at,expires_at FROM sessions WHERE token_hash=?",
            (token_hash,),
        ).fetchone()
        return (row["created_at"], row["expires_at"]) if row else None

    def delete(self, token_hash: str) -> None:
        self.conn.execute("DELETE FROM sessions WHERE token_hash=?", (token_hash,))

    def delete_expired(self, now: str) -> None:
        self.conn.execute("DELETE FROM sessions WHERE expires_at<?", (now,))


class SqliteUnitOfWork:
    def __init__(self, database: SQLiteDatabase, mappers: RecordMapperRegistry) -> None:
        self.database = database
        self.mappers = mappers
        self.conn: sqlite3.Connection | None = None

    def __enter__(self) -> Self:
        self.conn = self.database.connect()
        self.records = SqliteRecordRepository(self.conn, self.mappers)
        self.relationships = SqliteRelationshipRepository(self.conn)
        self.sessions = SqliteSessionRepository(self.conn)
        return self

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        traceback: TracebackType | None,
    ) -> None:
        if self.conn is None:
            return
        if exc_type:
            self.conn.rollback()
        else:
            self.conn.commit()
        self.conn.close()

    def commit(self) -> None:
        if self.conn:
            self.conn.commit()

    def rollback(self) -> None:
        if self.conn:
            self.conn.rollback()
