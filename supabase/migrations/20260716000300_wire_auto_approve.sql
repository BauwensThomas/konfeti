-- `events.auto_approve` (brief, wizard extras) est stocké depuis la Phase 1
-- mais n'a JAMAIS été consulté par le vrai flux RSVP -- un vrai gap trouvé en
-- discutant du blocage définitif avec Thomas (le bouton "Bloquer" ne doit
-- avoir de sens que si l'événement accepte n'importe qui automatiquement,
-- ce qui suppose que ce réglage fonctionne réellement). Câblage réel ici :
-- si actif, `create_own_rsvp` approuve directement (statut 'approved', rôle
-- 'guest') au lieu de 'pending', et poste le message système "joined"
-- immédiatement (même logique que `admin_approve_rsvp`, sinon l'auto-approbation
-- resterait silencieuse dans le chat). Ne s'applique jamais à `answer = 'no'`
-- (reste 'restricted', aucune notion d'approbation dans ce cas).
create or replace function create_own_rsvp(
  p_event_id uuid,
  p_first_name text,
  p_last_name text,
  p_phone text,
  p_gender text,
  p_avatar_kind text,
  p_avatar_value text,
  p_answer text
)
returns uuid
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_rsvp_id uuid;
  v_status text;
  v_role text;
  v_existing_id uuid;
  v_existing_status text;
  v_existing_blocked boolean;
  v_auto_approve boolean;
begin
  select id, status, blocked into v_existing_id, v_existing_status, v_existing_blocked
  from rsvps
  where event_id = p_event_id and profile_id = (select auth.uid());

  if v_existing_id is not null and v_existing_blocked then
    raise exception 'participant is blocked';
  end if;

  if v_existing_id is not null and v_existing_status not in ('removed', 'left') then
    raise exception 'une participation existe deja pour cet evenement';
  end if;

  select auto_approve into v_auto_approve from events where id = p_event_id;

  v_status := case
    when p_answer = 'no' then 'restricted'
    when v_auto_approve then 'approved'
    else 'pending'
  end;
  v_role := 'guest';

  if v_existing_id is not null then
    update rsvps set
      first_name = p_first_name,
      last_name = p_last_name,
      phone = p_phone,
      gender = p_gender,
      avatar_kind = p_avatar_kind,
      avatar_value = p_avatar_value,
      status = v_status,
      role = v_role,
      answer = p_answer,
      approved_at = case when v_status = 'approved' then now() else null end,
      is_anonymized = false,
      updated_at = now()
    where id = v_existing_id;
    v_rsvp_id := v_existing_id;
  else
    insert into rsvps (
      event_id, profile_id, first_name, last_name, phone, gender,
      avatar_kind, avatar_value, status, role, answer,
      approved_at
    ) values (
      p_event_id, (select auth.uid()), p_first_name, p_last_name, p_phone, p_gender,
      p_avatar_kind, p_avatar_value, v_status, v_role, p_answer,
      case when v_status = 'approved' then now() else null end
    )
    returning id into v_rsvp_id;
  end if;

  -- Même message système que `admin_approve_rsvp` (nom figé au moment de la
  -- création, voir 20260714000600) -- sinon l'auto-approbation resterait
  -- invisible dans le chat, contrairement à une validation manuelle.
  if v_status = 'approved' then
    insert into messages (event_id, rsvp_id, channel, is_system, body, system_author_name)
    values (p_event_id, v_rsvp_id, 'main', true, 'joined', trim(concat_ws(' ', p_first_name, p_last_name)));
  end if;

  return v_rsvp_id;
end;
$$;
