-- ============================================================================
-- Dogleg — Notifications hardening (2026-07-07)
-- ============================================================================
-- Fixes two findings from the alerts review:
--
-- 1. SECURITY: the notifications table had INSERT policies with CHECK (true)
--    ("Anyone/System can create notifications"), letting any logged-in user
--    write arbitrary notifications to any user's tray while impersonating any
--    actor. They existed because create_notification() was NOT SECURITY
--    DEFINER — the trigger inserted with the acting user's permissions and
--    needed an open policy. Fix: make the trigger function SECURITY DEFINER
--    (pinned search_path), then drop the permissive INSERT policies. With RLS
--    enabled and no INSERT policy, direct client inserts are denied while the
--    triggers keep working as table owner.
--
-- 2. SPAM/DEDUP: reaction toggling is delete+insert, and every re-insert
--    minted a fresh "X reacted to your round" notification; un-reacting never
--    removed one. Now: a duplicate (same recipient, actor, round) reaction
--    notification within 24h is skipped, follow notifications dedup within
--    7 days (follow/unfollow churn), and when an actor's LAST reaction on a
--    round is removed their reaction notifications for it are cleaned up.
--
-- Also collapses the three identical SELECT policies into one.
-- Safe to re-run.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. The notification writer, now SECURITY DEFINER + deduped
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_notification()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF TG_TABLE_NAME = 'reactions' THEN
        INSERT INTO notifications (user_id, type, actor_id, round_id, message)
        SELECT r.user_id, 'reaction', NEW.user_id, NEW.round_id,
               p.username || ' reacted to your round'
        FROM rounds r
        JOIN profiles p ON p.id = NEW.user_id
        WHERE r.id = NEW.round_id
          AND r.user_id != NEW.user_id
          -- Toggle guard: one reaction notification per actor/round per day
          AND NOT EXISTS (
            SELECT 1 FROM notifications n
            WHERE n.user_id = r.user_id
              AND n.type = 'reaction'
              AND n.actor_id = NEW.user_id
              AND n.round_id = NEW.round_id
              AND n.created_at > now() - interval '24 hours'
          );
    ELSIF TG_TABLE_NAME = 'comments' THEN
        INSERT INTO notifications (user_id, type, actor_id, round_id, comment_id, message)
        SELECT r.user_id, 'comment', NEW.user_id, NEW.round_id, NEW.id,
               p.username || ' commented on your round'
        FROM rounds r
        JOIN profiles p ON p.id = NEW.user_id
        WHERE r.id = NEW.round_id AND r.user_id != NEW.user_id;
    ELSIF TG_TABLE_NAME = 'follows' THEN
        INSERT INTO notifications (user_id, type, actor_id, message)
        SELECT NEW.following_id, 'follow', NEW.follower_id,
               p.username || ' started following you'
        FROM profiles p
        WHERE p.id = NEW.follower_id
          -- Follow/unfollow churn guard: one follow notification per week
          AND NOT EXISTS (
            SELECT 1 FROM notifications n
            WHERE n.user_id = NEW.following_id
              AND n.type = 'follow'
              AND n.actor_id = NEW.follower_id
              AND n.created_at > now() - interval '7 days'
          );
    END IF;
    RETURN NEW;
END;
$$;

-- When an actor's last remaining reaction on a round goes away, their
-- reaction notifications for that round go with it.
CREATE OR REPLACE FUNCTION public.cleanup_reaction_notification()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM reactions
      WHERE round_id = OLD.round_id AND user_id = OLD.user_id
    ) THEN
      DELETE FROM notifications
      WHERE type = 'reaction'
        AND actor_id = OLD.user_id
        AND round_id = OLD.round_id;
    END IF;
    RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS reaction_notification_cleanup ON public.reactions;
CREATE TRIGGER reaction_notification_cleanup
  AFTER DELETE ON public.reactions
  FOR EACH ROW EXECUTE FUNCTION public.cleanup_reaction_notification();

REVOKE EXECUTE ON FUNCTION public.create_notification() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_reaction_notification() FROM PUBLIC, anon, authenticated;


-- ----------------------------------------------------------------------------
-- 2. Policy cleanup: no direct inserts, one SELECT policy, keep UPDATE
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS "Anyone can create notifications"  ON public.notifications;
DROP POLICY IF EXISTS "System can create notifications"  ON public.notifications;
DROP POLICY IF EXISTS "Users can view own notifications"  ON public.notifications;
DROP POLICY IF EXISTS "Users can view their notifications" ON public.notifications;
-- Survivors: "Users can view their own notifications" (SELECT, auth.uid() = user_id)
--            "Users can update own notifications"      (UPDATE, auth.uid() = user_id)
