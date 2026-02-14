using Kombats.Infrastructure.Data;
using Kombats.Infrastructure.Messaging.Inbox;
using Kombats.Players.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Kombats.Infrastructure.Configuration;

public sealed class InboxMessageConfig : IEntityTypeConfiguration<InboxMessage>
{
    public void Configure(EntityTypeBuilder<InboxMessage> b)
    {
        b.ToTable("inbox_messages");
        b.HasKey(x => x.MessageId);
        b.Property(x => x.ProcessedAt).IsRequired();
    }
}