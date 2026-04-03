using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Kombats.Battle.Infrastructure.Persistence.EF.Migrations
{
    /// <inheritdoc />
    public partial class MoveToSchemaAndNormalizeDb : Migration
    {
        private const string Schema = "battle";

        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(name: Schema);

            migrationBuilder.RenameTable(name: "battles", schema: null, newName: "battles", newSchema: Schema);
            migrationBuilder.RenameTable(name: "InboxState", schema: null, newName: "InboxState", newSchema: Schema);
            migrationBuilder.RenameTable(name: "OutboxMessage", schema: null, newName: "OutboxMessage", newSchema: Schema);
            migrationBuilder.RenameTable(name: "OutboxState", schema: null, newName: "OutboxState", newSchema: Schema);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.RenameTable(name: "battles", schema: Schema, newName: "battles", newSchema: null);
            migrationBuilder.RenameTable(name: "InboxState", schema: Schema, newName: "InboxState", newSchema: null);
            migrationBuilder.RenameTable(name: "OutboxMessage", schema: Schema, newName: "OutboxMessage", newSchema: null);
            migrationBuilder.RenameTable(name: "OutboxState", schema: Schema, newName: "OutboxState", newSchema: null);
        }
    }
}
