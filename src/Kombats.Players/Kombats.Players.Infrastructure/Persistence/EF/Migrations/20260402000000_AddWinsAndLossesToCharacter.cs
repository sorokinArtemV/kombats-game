using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Kombats.Players.Infrastructure.Persistence.EF.Migrations
{
    /// <inheritdoc />
    public partial class AddWinsAndLossesToCharacter : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "wins",
                schema: "players",
                table: "characters",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "losses",
                schema: "players",
                table: "characters",
                type: "integer",
                nullable: false,
                defaultValue: 0);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "wins",
                schema: "players",
                table: "characters");

            migrationBuilder.DropColumn(
                name: "losses",
                schema: "players",
                table: "characters");
        }
    }
}
