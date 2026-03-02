using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Kombats.Players.Infrastructure.Persistence.EF.Migrations
{
    /// <inheritdoc />
    public partial class AddLevelingVersionToCharacter : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "leveling_version",
                schema: "players",
                table: "characters",
                type: "integer",
                nullable: false,
                defaultValue: 1);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "leveling_version",
                schema: "players",
                table: "characters");
        }
    }
}

