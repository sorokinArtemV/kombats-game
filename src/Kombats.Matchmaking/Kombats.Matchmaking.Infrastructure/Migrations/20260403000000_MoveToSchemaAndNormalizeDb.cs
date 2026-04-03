using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Kombats.Matchmaking.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class MoveToSchemaAndNormalizeDb : Migration
    {
        private const string Schema = "matchmaking";

        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(name: Schema);

            migrationBuilder.RenameTable(name: "matches", schema: null, newName: "matches", newSchema: Schema);
            migrationBuilder.RenameTable(name: "matchmaking_outbox_messages", schema: null, newName: "matchmaking_outbox_messages", newSchema: Schema);
            migrationBuilder.RenameTable(name: "player_combat_profiles", schema: null, newName: "player_combat_profiles", newSchema: Schema);
            migrationBuilder.RenameTable(name: "InboxState", schema: null, newName: "InboxState", newSchema: Schema);
            migrationBuilder.RenameTable(name: "OutboxMessage", schema: null, newName: "OutboxMessage", newSchema: Schema);
            migrationBuilder.RenameTable(name: "OutboxState", schema: null, newName: "OutboxState", newSchema: Schema);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.RenameTable(name: "matches", schema: Schema, newName: "matches", newSchema: null);
            migrationBuilder.RenameTable(name: "matchmaking_outbox_messages", schema: Schema, newName: "matchmaking_outbox_messages", newSchema: null);
            migrationBuilder.RenameTable(name: "player_combat_profiles", schema: Schema, newName: "player_combat_profiles", newSchema: null);
            migrationBuilder.RenameTable(name: "InboxState", schema: Schema, newName: "InboxState", newSchema: null);
            migrationBuilder.RenameTable(name: "OutboxMessage", schema: Schema, newName: "OutboxMessage", newSchema: null);
            migrationBuilder.RenameTable(name: "OutboxState", schema: Schema, newName: "OutboxState", newSchema: null);
        }
    }
}
