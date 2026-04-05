-- 1. Schema Changes
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS trust_score INTEGER DEFAULT 27;

-- 2. Trust Score Computation Function
CREATE OR REPLACE FUNCTION public.calculate_trust_score(p_user_id UUID)
RETURNS integer AS $$
DECLARE
  v_score NUMERIC := 0;
  v_profile RECORD;
  v_days_old INTEGER;
  
  -- Borrowing stats
  v_borrowed_total INTEGER := 0;
  v_borrowed_completed INTEGER := 0;
  v_borrowed_overdue INTEGER := 0;
  
  -- Lending stats
  v_lent_total INTEGER := 0;
  
  -- Activity stats
  v_recent_activities INTEGER := 0;
BEGIN
  -- Fetch user profile
  SELECT * INTO v_profile FROM public.profiles WHERE id = p_user_id;
  IF NOT FOUND THEN RETURN 0; END IF;

  -- ============================================
  -- PILLAR 1: Identity (Max 30)
  -- ============================================
  IF v_profile.is_verified THEN v_score := v_score + 15; END IF;
  IF v_profile.name IS NOT NULL AND v_profile.avatar_url IS NOT NULL THEN v_score := v_score + 5; END IF;

  v_days_old := EXTRACT(DAY FROM (now() - v_profile.created_at));
  IF v_days_old >= 365 THEN v_score := v_score + 10;
  ELSIF v_days_old >= 90 THEN v_score := v_score + 8;
  ELSIF v_days_old >= 30 THEN v_score := v_score + 5;
  ELSE v_score := v_score + 2;
  END IF;

  -- ============================================
  -- PILLAR 2: Borrowing (Max 40)
  -- ============================================
  SELECT 
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'completed'),
    COUNT(*) FILTER (WHERE status = 'overdue')
  INTO v_borrowed_total, v_borrowed_completed, v_borrowed_overdue
  FROM public.loans
  WHERE (user_id = p_user_id AND type = 'borrowed') 
     OR (lower(borrower_email) = lower(v_profile.email));

  IF v_borrowed_total = 0 THEN
    v_score := v_score + 20; -- Base score for no history
  ELSE
    -- Completion Rate
    IF (v_borrowed_completed + v_borrowed_overdue) = 0 THEN
      v_score := v_score + 10; -- Has active loans but nothing completed or overdue yet
    ELSE
      v_score := v_score + ((v_borrowed_completed::NUMERIC / (v_borrowed_completed + v_borrowed_overdue)) * 20);
    END IF;

    -- Default Penalty Avoidance
    v_score := v_score + ((1.0 - (v_borrowed_overdue::NUMERIC / v_borrowed_total)) * 20);
  END IF;

  -- ============================================
  -- PILLAR 3: Lending & Engagement (Max 30)
  -- ============================================
  SELECT COUNT(*) INTO v_lent_total FROM public.loans 
  WHERE (user_id = p_user_id AND type = 'lent') 
     OR (lower(lender_email) = lower(v_profile.email));

  IF v_lent_total >= 5 THEN v_score := v_score + 15;
  ELSIF v_lent_total >= 2 THEN v_score := v_score + 10;
  ELSIF v_lent_total = 1 THEN v_score := v_score + 5;
  END IF;

  SELECT COUNT(*) INTO v_recent_activities FROM public.activities 
  WHERE user_id = p_user_id AND created_at > now() - INTERVAL '30 days';

  IF v_recent_activities >= 10 THEN v_score := v_score + 15;
  ELSIF v_recent_activities >= 5 THEN v_score := v_score + 10;
  ELSIF v_recent_activities >= 1 THEN v_score := v_score + 5;
  END IF;

  -- Clamp score between 0 and 100
  RETURN LEAST(GREATEST(ROUND(v_score), 0), 100);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Triggers for Real-Time Updates
CREATE OR REPLACE FUNCTION public.trigger_update_trust_score()
RETURNS trigger AS $$
DECLARE
  target_user_id UUID;
BEGIN
  -- Determine which user needs updating based on the table receiving the trigger
  IF TG_TABLE_NAME = 'loans' THEN
    target_user_id := NEW.user_id;
  ELSIF TG_TABLE_NAME = 'activities' THEN
    target_user_id := NEW.user_id;
  ELSIF TG_TABLE_NAME = 'profiles' THEN
    target_user_id := NEW.id;
  END IF;

  -- Fire an async update or direct update (direct update here)
  IF target_user_id IS NOT NULL THEN
    UPDATE public.profiles 
    SET trust_score = calculate_trust_score(target_user_id) 
    WHERE id = target_user_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply Triggers
DROP TRIGGER IF EXISTS on_loan_changed ON public.loans;
CREATE TRIGGER on_loan_changed
AFTER INSERT OR UPDATE ON public.loans
FOR EACH ROW EXECUTE FUNCTION public.trigger_update_trust_score();

DROP TRIGGER IF EXISTS on_activity_added ON public.activities;
CREATE TRIGGER on_activity_added
AFTER INSERT ON public.activities
FOR EACH ROW EXECUTE FUNCTION public.trigger_update_trust_score();

DROP TRIGGER IF EXISTS on_profile_verified ON public.profiles;
CREATE TRIGGER on_profile_verified
AFTER UPDATE OF is_verified ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.trigger_update_trust_score();
