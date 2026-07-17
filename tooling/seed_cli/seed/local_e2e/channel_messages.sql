WITH local_e2e_channels AS (
    SELECT
        channel.id,
        array_agg(participant.user_id ORDER BY participant.user_id) AS sender_ids
    FROM comms_channels AS channel
    JOIN comms_channel_participants AS participant
        ON participant.channel_id = channel.id
        AND participant.left_at IS NULL
    WHERE channel.id::text LIKE '00000000-0000-0000-0000-00000000000%'
    GROUP BY channel.id
)
INSERT INTO comms_messages (id, channel_id, sender_id, content, created_at, updated_at)
SELECT
    md5('local-e2e-scroll-' || channel.id::text || '-' || message_number)::uuid,
    channel.id,
    channel.sender_ids[
        1 + ((message_number - 1) % cardinality(channel.sender_ids))::integer
    ],
    CASE
        WHEN message_number % 7 = 0 THEN repeat('Variable-height scroll fixture message ' || message_number || '. ', 12)
        ELSE 'Scroll fixture message ' || message_number
    END,
    now() + (message_number || ' milliseconds')::interval,
    now() + (message_number || ' milliseconds')::interval
FROM local_e2e_channels AS channel
CROSS JOIN generate_series(1, 5000) AS message_number;

INSERT INTO comms_messages (
    id,
    channel_id,
    sender_id,
    content,
    created_at,
    updated_at
)
VALUES (
    '00000000-0000-0000-0003-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000001'::uuid,
    'macro|bob@example.com',
    'Deep thread navigation fixture parent',
    now() - interval '1 day',
    now() - interval '1 day'
);

WITH deep_thread_replies AS (
    SELECT
        reply_number,
        (
            '00000000-0000-0000-0003-'
            || lpad((reply_number + 1)::text, 12, '0')
        )::uuid AS id,
        CASE
            WHEN reply_number = 5 THEN 'Deep thread target reply'
            ELSE (
                SELECT string_agg(
                    format(
                        'Tall thread reply %s, paragraph %s. This fixture deliberately occupies enough vertical space to expose reply navigation that races the outer virtualizer measurement.',
                        reply_number,
                        paragraph_number
                    ),
                    E'\n\n' ORDER BY paragraph_number
                )
                FROM generate_series(1, 24) AS paragraph(paragraph_number)
            )
        END AS content
    FROM generate_series(1, 5) AS reply(reply_number)
)
INSERT INTO comms_messages (
    id,
    channel_id,
    sender_id,
    content,
    thread_id,
    created_at,
    updated_at
)
SELECT
    id,
    '00000000-0000-0000-0000-000000000001'::uuid,
    CASE
        WHEN reply_number % 2 = 0 THEN 'macro|charlie@example.com'
        ELSE 'macro|bob@example.com'
    END,
    content,
    '00000000-0000-0000-0003-000000000001'::uuid,
    now() - interval '1 day' + (reply_number || ' seconds')::interval,
    now() - interval '1 day' + (reply_number || ' seconds')::interval
FROM deep_thread_replies;
