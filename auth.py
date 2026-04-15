from flask import Blueprint, request, jsonify
from flask_bcrypt import generate_password_hash, check_password_hash
from flask_jwt_extended import create_access_token, jwt_required, get_jwt_identity
import psycopg2
from psycopg2.extras import DictCursor
from datetime import datetime

auth_bp = Blueprint("auth", __name__)


# Database connection helper
def get_db_connection():
    conn = psycopg2.connect(
        host="localhost", database="fit360", user="postgres", password="dennismagaki"
    )
    return conn


# ------------------ AUTHENTICATION ROUTES ------------------ #
@auth_bp.route("/signup", methods=["POST"])
def signup():
    data = request.get_json()
    full_name = data.get("fullName")
    email = data.get("email")
    password = data.get("password")
    role = data.get("role")

    if not all([full_name, email, password, role]):
        return jsonify({"error": "All fields are required"}), 400

    valid_roles = ["player", "coach", "physio", "trainer"]
    if role not in valid_roles:
        return jsonify({"error": "Invalid role"}), 400

    conn = get_db_connection()
    cursor = conn.cursor(cursor_factory=DictCursor)
    try:
        # Check for existing email
        cursor.execute("SELECT id FROM users WHERE email = %s", (email,))
        if cursor.fetchone():
            return jsonify({"error": "Email already registered"}), 400

        hashed_password = generate_password_hash(password).decode("utf-8")
        cursor.execute(
            "INSERT INTO users (full_name, email, password_hash, role) VALUES (%s, %s, %s, %s) RETURNING id",
            (full_name, email, hashed_password, role),
        )
        conn.commit()
        return jsonify({"message": "User registered successfully"}), 201
    except Exception as e:
        conn.rollback()
        return jsonify({"error": str(e)}), 400
    finally:
        cursor.close()
        conn.close()


@auth_bp.route("/login", methods=["POST"])
def login():
    data = request.get_json()
    email = data.get("email")
    password = data.get("password")

    conn = get_db_connection()
    cursor = conn.cursor(cursor_factory=DictCursor)
    try:
        cursor.execute("SELECT * FROM users WHERE email = %s", (email,))
        user = cursor.fetchone()

        if not user or not check_password_hash(user["password_hash"], password):
            return jsonify({"error": "Invalid credentials"}), 401

        access_token = create_access_token(
            identity=str(user["id"]), additional_claims={"role": user["role"]}
        )
        return jsonify({"token": access_token}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        cursor.close()
        conn.close()


@auth_bp.route("/user", methods=["GET"])
@jwt_required()
def get_current_user():
    conn = get_db_connection()
    cursor = conn.cursor(cursor_factory=DictCursor)
    try:
        user_id = get_jwt_identity()
        cursor.execute(
            "SELECT id, full_name, email, role FROM users WHERE id = %s", (user_id,)
        )
        user = cursor.fetchone()
        if not user:
            return jsonify({"error": "User not found"}), 404
        return jsonify(dict(user)), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        cursor.close()
        conn.close()


# ------------------ DASHBOARD DATA ROUTES ------------------ #
@auth_bp.route("/dashboard/<role>", methods=["GET"])
@jwt_required()
def get_role_data(role):
    valid_roles = ["player", "coach", "physio", "trainer"]
    if role not in valid_roles:
        return jsonify({"error": "Invalid role"}), 400

    user_id = get_jwt_identity()
    conn = get_db_connection()
    cursor = conn.cursor(cursor_factory=DictCursor)
    try:
        # Verify user exists and role matches
        cursor.execute("SELECT role FROM users WHERE id = %s", (user_id,))
        user = cursor.fetchone()
        if not user:
            return jsonify({"error": "User not found"}), 404
        if user["role"] != role:
            return jsonify({"error": "Role mismatch"}), 403

        if role == "player":
            return get_player_data(cursor, user_id)
        elif role == "coach":
            return get_coach_data(cursor, user_id)
        elif role == "physio":
            return get_physio_data(cursor, user_id)
        elif role == "trainer":
            return get_trainer_data(cursor, user_id)
        return jsonify({"error": "Role not implemented"}), 501
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        cursor.close()
        conn.close()


def get_player_data(cursor, user_id):
    # Fetch staff details
    cursor.execute(
        """
        SELECT
            c.full_name AS coach,
            p.full_name AS physio,
            t.full_name AS trainer
        FROM users u
        LEFT JOIN coach_players cp ON u.id = cp.player_id
        LEFT JOIN users c ON cp.coach_id = c.id
        LEFT JOIN physio_players pp ON u.id = pp.player_id
        LEFT JOIN users p ON pp.physio_id = p.id
        LEFT JOIN trainer_players tp ON u.id = tp.player_id
        LEFT JOIN users t ON tp.trainer_id = t.id
        WHERE u.id = %s
    """,
        (user_id,),
    )
    staff = cursor.fetchone() or {}

    # Fetch raw injury data from the injuries table
    cursor.execute(
        """
        SELECT *
        FROM injuries
        WHERE user_id = %s
        ORDER BY injury_date DESC
        LIMIT 1
    """,
        (user_id,),
    )
    raw_injury = cursor.fetchone() or {}

    # Fetch detailed injury data from the view (which calculates estimated_recovery_date and is_active)
    cursor.execute(
        """
        SELECT *
        FROM injuries_with_details
        WHERE user_id = %s
        ORDER BY injury_date DESC
        LIMIT 1
    """,
        (user_id,),
    )
    injury_details = cursor.fetchone() or {}

    data = {
        "staff": dict(staff) if staff else {},
        "raw_injury": dict(raw_injury) if raw_injury else {},
        "injury_details": dict(injury_details) if injury_details else {},
        "performance": query_table(cursor, "performance_tracking", user_id),
        "tracker": query_table(cursor, "tracker_data", user_id, limit=7),
        "nutrition": query_table(cursor, "nutrition_plans", user_id),
        "training_sessions": query_table(cursor, "training_sessions", user_id, limit=5),
    }
    return jsonify(data), 200


def get_coach_data(cursor, user_id):
    cursor.execute(
        """
            SELECT 
                u.id,
                u.full_name,
                u.email,
                pp.gender,
                pwa.age,
                (SELECT TO_CHAR(pt.recorded_at, 'YYYY-MM-DD')
                FROM performance_tracking pt 
                WHERE pt.user_id = u.id 
                ORDER BY pt.recorded_at DESC LIMIT 1) AS last_performance,
                (SELECT TO_CHAR(t.session_date, 'YYYY-MM-DD')
                FROM training_sessions t 
                WHERE t.user_id = u.id 
                ORDER BY t.session_date DESC LIMIT 1) AS last_training,
                (SELECT COUNT(*) FROM injuries 
                WHERE injuries.user_id = u.id AND estimated_recovery_date > CURRENT_DATE) AS is_injured,
                COALESCE(
                    (SELECT json_agg(json_build_object(
                        'type', injury_type,
                        'severity', severity,
                        'injury_date', injury_date,
                        'recovery_date', estimated_recovery_date,
                        'is_active', (estimated_recovery_date > CURRENT_DATE)
                    )) FROM injuries WHERE injuries.user_id = u.id),
                    '[]'::json
                ) AS injuries,
                COALESCE(
                    (SELECT json_build_object(
                        'injury_risk', injury_risk,
                        'intensity_change', intensity_change,
                        'other_recommendations', other_recommendations
                    )
                    FROM ml_recommendations 
                    WHERE ml_recommendations.user_id = u.id
                    ORDER BY created_at DESC LIMIT 1),
                    '{}'::json
                ) AS ml_recommendations
            FROM users u
            LEFT JOIN player_profiles pp ON u.id = pp.player_id
            LEFT JOIN player_profiles_with_age pwa ON u.id = pwa.player_id
            JOIN coach_players cp ON u.id = cp.player_id
            WHERE cp.coach_id = %s
            ORDER BY u.full_name
    """,
        (user_id,),
    )
    assigned_players = [dict(row) for row in cursor.fetchall()]

    # Calculate summary stats
    total_players = len(assigned_players)
    injured_count = sum(1 for player in assigned_players if player["is_injured"] > 0)
    healthy_count = total_players - injured_count

    return (
        jsonify(
            {
                "assigned_players": assigned_players,
                "summary": {
                    "total_players": total_players,
                    "injured_count": injured_count,
                    "healthy_count": healthy_count,
                },
            }
        ),
        200,
    )


@auth_bp.route("/player-profile", methods=["GET", "POST"])
@jwt_required()
def player_profile():
    player_id = get_jwt_identity()
    conn = get_db_connection()
    cursor = conn.cursor(cursor_factory=DictCursor)

    try:
        if request.method == "GET":
            cursor.execute(
                """
                SELECT 
                    u.full_name,
                    u.email,
                    pp.height_cm,
                    pp.weight_kg,
                    pp.date_of_birth,
                    pp.position,
                    pp.gender,
                    pwa.age
                FROM users u
                LEFT JOIN player_profiles pp ON u.id = pp.player_id
                LEFT JOIN player_profiles_with_age pwa ON u.id = pwa.player_id
                WHERE u.id = %s
            """,
                (player_id,))
            profile = cursor.fetchone()

            if profile and profile["height_cm"] is not None:
                return (
                    jsonify(
                        {
                            "exists": True,
                            "full_name": profile["full_name"],
                            "email": profile["email"],
                            "height_cm": profile["height_cm"],
                            "weight_kg": profile["weight_kg"],
                            "date_of_birth": profile["date_of_birth"],
                            "position": profile["position"],
                            "gender": profile["gender"],
                            "age": profile["age"],
                        }
                    ),
                    200,
                )
            else:
                return (
                    jsonify(
                        {
                            "exists": False,
                            "full_name": profile["full_name"],
                            "email": profile["email"],
                        }
                    ),
                    200,
                )

        elif request.method == "POST":
            data = request.get_json()
            cursor.execute(
                """
                INSERT INTO player_profiles 
                (player_id, height_cm, weight_kg, date_of_birth, position, gender)
                VALUES (%s, %s, %s, %s, %s, %s)
                ON CONFLICT (player_id) DO UPDATE SET
                    height_cm = EXCLUDED.height_cm,
                    weight_kg = EXCLUDED.weight_kg,
                    date_of_birth = EXCLUDED.date_of_birth,
                    position = EXCLUDED.position,
                    gender = EXCLUDED.gender
            """,
                (
                    player_id,
                    data.get("height_cm"),
                    data.get("weight_kg"),
                    data.get("date_of_birth"),
                    data.get("position"),
                    data.get("gender"),
                ),
            )
            conn.commit()
            return jsonify({"message": "Profile updated successfully"}), 200

    except Exception as e:
        conn.rollback()
        return jsonify({"error": str(e)}), 400
    finally:
        cursor.close()
        conn.close()


# ------------------ COACH-SPECIFIC ROUTES ------------------ #
@auth_bp.route("/dashboard/coach/available-players", methods=["GET"])
@jwt_required()
def get_available_players():
    conn = get_db_connection()
    cursor = conn.cursor(cursor_factory=DictCursor)
    try:
        cursor.execute(
            """
            SELECT id, full_name 
            FROM users 
            WHERE role = 'player'
            AND id NOT IN (SELECT player_id FROM coach_players)
        """
        )
        players = [dict(row) for row in cursor.fetchall()]
        return jsonify(players), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        cursor.close()
        conn.close()


@auth_bp.route("/dashboard/coach/assign-player", methods=["POST"])
@jwt_required()
def assign_player():
    conn = get_db_connection()
    cursor = conn.cursor(cursor_factory=DictCursor)
    try:
        coach_id = get_jwt_identity()
        player_id = request.json.get("player_id")

        # Validate player exists and is available
        cursor.execute("SELECT role FROM users WHERE id = %s", (player_id,))
        player = cursor.fetchone()
        if not player or player["role"] != "player":
            return jsonify({"error": "Invalid player"}), 400

        cursor.execute(
            "SELECT * FROM coach_players WHERE coach_id = %s AND player_id = %s",
            (coach_id, player_id),
        )
        if cursor.fetchone():
            return jsonify({"error": "Player already assigned"}), 400

        cursor.execute(
            "INSERT INTO coach_players (coach_id, player_id) VALUES (%s, %s)",
            (coach_id, player_id),
        )
        conn.commit()
        return jsonify({"message": "Player assigned successfully"}), 200
    except Exception as e:
        conn.rollback()
        return jsonify({"error": str(e)}), 400
    finally:
        cursor.close()
        conn.close()


# ------------------ UTILITY FUNCTIONS ------------------ #
def query_table(cursor, table_name, user_id, limit=None):
    valid_tables = [
        "performance_tracking",
        "tracker_data",
        "nutrition_plans",
        "training_sessions",
    ]
    if table_name not in valid_tables:
        return []

    # Define the appropriate timestamp field for each table
    timestamp_fields = {
        "performance_tracking": "recorded_at",
        "tracker_data": "recorded_at",
        "nutrition_plans": "created_at",
        "training_sessions": "session_date",
    }

    timestamp_field = timestamp_fields.get(table_name, "created_at")

    query = (
        f"SELECT * FROM {table_name} WHERE user_id = %s ORDER BY {timestamp_field} DESC"
    )
    if limit:
        query += f" LIMIT {limit}"

    try:
        cursor.execute(query, (user_id,))
        return [dict(row) for row in cursor.fetchall()]
    except Exception as e:
        print(f"Error querying {table_name}: {str(e)}")
        return []


# ------------------ PHYSIO-SPECIFIC ROUTES ------------------ #
@auth_bp.route("/dashboard/physio/available-players", methods=["GET"])
@jwt_required()
def get_available_players_physio():
    conn = get_db_connection()
    cursor = conn.cursor(cursor_factory=DictCursor)
    try:
        cursor.execute(
            """
            SELECT id, full_name 
            FROM users 
            WHERE role = 'player'
            AND id NOT IN (SELECT player_id FROM physio_players)
        """
        )
        players = [dict(row) for row in cursor.fetchall()]
        return jsonify(players), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        cursor.close()
        conn.close()


@auth_bp.route("/dashboard/physio/assign-player", methods=["POST"])
@jwt_required()
def assign_player_physio():
    conn = get_db_connection()
    cursor = conn.cursor(cursor_factory=DictCursor)
    try:
        physio_id = get_jwt_identity()
        player_id = request.json.get("player_id")

        # Validate player exists
        cursor.execute("SELECT role FROM users WHERE id = %s", (player_id,))
        player = cursor.fetchone()
        if not player or player["role"] != "player":
            return jsonify({"error": "Invalid player"}), 400

        cursor.execute(
            "SELECT * FROM physio_players WHERE physio_id = %s AND player_id = %s",
            (physio_id, player_id),
        )
        if cursor.fetchone():
            return jsonify({"error": "Player already assigned"}), 400

        cursor.execute(
            "INSERT INTO physio_players (physio_id, player_id) VALUES (%s, %s)",
            (physio_id, player_id),
        )
        conn.commit()
        return jsonify({"message": "Player assigned successfully"}), 200
    except Exception as e:
        conn.rollback()
        return jsonify({"error": str(e)}), 400
    finally:
        cursor.close()
        conn.close()


def get_physio_data(cursor, user_id):
    cursor.execute(
        """
        SELECT 
            u.id,
            u.full_name,
            u.email,
            pp.gender,
            pp.height_cm,
            pp.weight_kg,
            pp.date_of_birth,
            pp.position,
            pwa.age,
            c.full_name AS coach,
            t.full_name AS trainer,
            i.injury_type,
            i.severity,
            i.injury_date,
            i.estimated_recovery_date,
            (i.estimated_recovery_date > CURRENT_DATE) AS is_active,
            COALESCE(mr.injury_risk, 'Unknown') AS injury_risk,
            COALESCE(mr.protein_change, 'Maintain') AS protein_change,
            COALESCE(mr.carbs_change, 'Maintain') AS carbs_change,
            COALESCE(mr.fat_change, 'Maintain') AS fat_change
        FROM users u
        JOIN physio_players p2 ON u.id = p2.player_id
        LEFT JOIN player_profiles pp ON u.id = pp.player_id
        LEFT JOIN player_profiles_with_age pwa ON u.id = pwa.player_id
        LEFT JOIN coach_players cp ON u.id = cp.player_id
        LEFT JOIN users c ON cp.coach_id = c.id
        LEFT JOIN trainer_players tp ON u.id = tp.player_id
        LEFT JOIN users t ON tp.trainer_id = t.id
        LEFT JOIN injuries i ON u.id = i.user_id
        LEFT JOIN ml_recommendations mr ON u.id = mr.user_id
        WHERE p2.physio_id = %s
        ORDER BY i.injury_date DESC;
        """,
        (user_id,),
    )

    players = {}
    for row in cursor.fetchall():
        row = dict(row)
        pid = row["id"]
        if pid not in players:
            players[pid] = {
                "id": row["id"],
                "full_name": row["full_name"],
                "email": row["email"],
                "gender": row.get("gender") or "Not provided",
                "age": row.get("age") or "Not provided",
                "height": row.get("height_cm") or "Not provided",
                "weight": row.get("weight_kg") or "Not provided",
                "date_of_birth": row.get("date_of_birth") or "Not provided",
                "position": row.get("position") or "Not provided",
                "coach": row.get("coach") or "Not assigned",
                "trainer": row.get("trainer") or "Not assigned",
                "injuries": [],
                "ml_recommendations": {  # ✅ Added ML recommendations output
                    "injury_risk": row.get("injury_risk", "Unknown"),
                    "protein_change": row.get("protein_change", "Maintain"),
                    "carbs_change": row.get("carbs_change", "Maintain"),
                    "fat_change": row.get("fat_change", "Maintain"),
                },
            }
        if row.get("injury_type"):
            players[pid]["injuries"].append(
                {
                    "type": row["injury_type"],
                    "severity": row["severity"],
                    "injury_date": row["injury_date"],
                    "recovery_date": row["estimated_recovery_date"],
                    "is_active": row["is_active"],
                }
            )

    player_list = list(players.values())

    # Calculate summary stats if needed
    active_injuries = sum(
        1 for p in player_list if any(i["is_active"] for i in p["injuries"])
    )
    recovering = sum(1 for p in player_list if len(p["injuries"]) > 0)

    return (
        jsonify(
            {
                "assigned_players": player_list,
                "summary": {
                    "total_players": len(player_list),
                    "active_injuries": active_injuries,
                    "inactive_injuries": len(player_list) - active_injuries,
                    "recovering_players": recovering,
                },
            }
        ),
        200,
    )



def get_trainer_data(cursor, user_id):
    """Handle trainer-specific data collection"""
    try:
        cursor.execute(
            """
            SELECT 
                u.id,
                u.full_name,
                u.email,
                pp.gender,
                pwa.age,
                pp.height_cm,
                pp.weight_kg,
                (SELECT recorded_at FROM performance_tracking 
                 WHERE user_id = u.id ORDER BY recorded_at DESC LIMIT 1) AS last_performance_check,
                (SELECT session_date FROM training_sessions 
                 WHERE user_id = u.id ORDER BY session_date DESC LIMIT 1) AS last_training,
                (SELECT AVG(distance_covered) FROM tracker_data 
                 WHERE user_id = u.id) AS avg_distance,
                (SELECT COUNT(*) FROM injuries 
                 WHERE user_id = u.id AND estimated_recovery_date > CURRENT_DATE) AS is_injured,
                COALESCE(mr.injury_risk, 'Unknown') AS injury_risk,
                COALESCE(mr.intensity_change, 'Maintain') AS intensity_change,
                COALESCE(mr.protein_change, 'Maintain') AS protein_change,
                COALESCE(mr.carbs_change, 'Maintain') AS carbs_change,
                COALESCE(mr.fat_change, 'Maintain') AS fat_change,
                COALESCE(mr.other_recommendations, 'No recommendations') AS other_recommendations
            FROM users u
            JOIN trainer_players tp ON u.id = tp.player_id
            LEFT JOIN player_profiles pp ON u.id = pp.player_id
            LEFT JOIN player_profiles_with_age pwa ON u.id = pwa.player_id
            LEFT JOIN ml_recommendations mr ON u.id = mr.user_id
            WHERE tp.trainer_id = %s
            GROUP BY u.id, pp.gender, pwa.age, pp.height_cm, pp.weight_kg, 
                     mr.injury_risk, mr.intensity_change, 
                     mr.protein_change, mr.carbs_change, 
                     mr.fat_change, mr.other_recommendations
            ORDER BY u.full_name;
            """,
            (user_id,),
        )

        players = []
        for row in cursor.fetchall():
            row = dict(row)
            row["ml_recommendations"] = {
                "injury_risk": row.pop("injury_risk", "Unknown"),
                "intensity_change": row.pop("intensity_change", "Maintain"),
                "protein_change": row.pop("protein_change", "Maintain"),
                "carbs_change": row.pop("carbs_change", "Maintain"),
                "fat_change": row.pop("fat_change", "Maintain"),
                "other_recommendations": row.pop("other_recommendations", "No recommendations"),
            }
            players.append(row)

        # Calculate summary stats
        total_players = len(players)
        active_players = 0
        total_distance = 0.0

        for p in players:
            if p["last_training"]:
                last_training_date = (
                    p["last_training"].date()
                    if isinstance(p["last_training"], datetime)
                    else p["last_training"]
                )
                if (datetime.now().date() - last_training_date).days <= 7:
                    active_players += 1
            total_distance += p["avg_distance"] or 0

        avg_distance = (
            round(total_distance / total_players, 1) if total_players > 0 else 0
        )

        return (
            jsonify(
                {
                    "assigned_players": players,
                    "summary": {
                        "total_players": total_players,
                        "active_players": active_players,
                        "avg_distance": avg_distance,
                    },
                }
            ),
            200,
        )

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@auth_bp.route("/dashboard/physio/add-injury", methods=["POST"])
@jwt_required()
def add_injury():
    data = request.get_json()
    physio_id = get_jwt_identity()  # Authenticated physio's ID
    player_id = data.get("player_id")
    injury_type = data.get("injury_type")
    severity = data.get("severity")
    recovery_time = data.get("recovery_time")  # In days
    injury_date = data.get("injury_date")  # Date format: YYYY-MM-DD

    if not all([player_id, injury_type, severity, recovery_time, injury_date]):
        return jsonify({"error": "All fields are required"}), 400

    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=DictCursor)


        # Ensure the physio is assigned to this player
        cursor.execute(
            "SELECT * FROM physio_players WHERE physio_id = %s AND player_id = %s",
            (physio_id, player_id),
        )
        if not cursor.fetchone():
            return jsonify({"error": "You are not assigned to this player"}), 403

        # Insert the new injury record
        cursor.execute(
            """
            INSERT INTO injuries (user_id, injury_type, severity, recovery_time, injury_date)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (player_id, injury_type, severity, recovery_time, injury_date),
        )

        conn.commit()
        return jsonify({"message": "Injury added successfully"}), 201

    except psycopg2.Error as e:
        conn.rollback()
        return jsonify({"error": f"Database error: {str(e)}"}), 500

    except Exception as e:
        return jsonify({"error": f"Server error: {str(e)}"}), 500

    finally:
        cursor.close()
        conn.close()

@auth_bp.route("/dashboard/physio/add-nutrition", methods=["POST"])
@jwt_required()
def add_nutrition():
    data = request.get_json()
    physio_id = get_jwt_identity()  # Authenticated physio's ID
    player_id = data.get("player_id")
    diet_plan = data.get("diet_plan")
    calories_per_day = data.get("calories_per_day")
    protein_intake = data.get("protein_intake")
    carbs_intake = data.get("carbs_intake")
    fat_intake = data.get("fat_intake")
    created_at = data.get("created_at")  # Date format: YYYY-MM-DD

    if not all([player_id, diet_plan, calories_per_day, protein_intake, carbs_intake, fat_intake, created_at]):
        return jsonify({"error": "All fields are required"}), 400

    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=DictCursor)

        # Ensure the physio is assigned to this player
        cursor.execute(
            "SELECT * FROM physio_players WHERE physio_id = %s AND player_id = %s",
            (physio_id, player_id),
        )
        if not cursor.fetchone():
            return jsonify({"error": "You are not assigned to this player"}), 403

        # Insert the new nutrition record
        cursor.execute(
            """
            INSERT INTO nutrition_plans (user_id, diet_plan, calories_per_day, protein_intake, carbs_intake, fat_intake, created_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            """,
            (player_id, diet_plan, calories_per_day, protein_intake, carbs_intake, fat_intake, created_at),
        )

        conn.commit()
        return jsonify({"message": "Nutrition plan added successfully"}), 201

    except psycopg2.Error as e:
        conn.rollback()
        return jsonify({"error": f"Database error: {str(e)}"}), 500

    except Exception as e:
        return jsonify({"error": f"Server error: {str(e)}"}), 500

    finally:
        cursor.close()
        conn.close()


@auth_bp.route("/dashboard/trainer/available-players", methods=["GET"])
@jwt_required()
def get_available_players_trainer():
    conn = get_db_connection()
    cursor = conn.cursor(cursor_factory=DictCursor)
    try:
        cursor.execute(
            """
            SELECT id, full_name 
            FROM users 
            WHERE role = 'player'
            AND id NOT IN (SELECT player_id FROM trainer_players)
        """
        )
        players = [dict(row) for row in cursor.fetchall()]
        return jsonify(players), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        cursor.close()
        conn.close()


@auth_bp.route("/dashboard/trainer/assign-player", methods=["POST"])
@jwt_required()
def assign_player_trainer():
    conn = get_db_connection()
    cursor = conn.cursor(cursor_factory=DictCursor)
    try:
        trainer_id = get_jwt_identity()
        player_id = request.json.get("player_id")

        cursor.execute("SELECT role FROM users WHERE id = %s", (player_id,))
        player = cursor.fetchone()
        if not player or player["role"] != "player":
            return jsonify({"error": "Invalid player"}), 400

        cursor.execute(
            "SELECT * FROM trainer_players WHERE trainer_id = %s AND player_id = %s",
            (trainer_id, player_id),
        )
        if cursor.fetchone():
            return jsonify({"error": "Player already assigned"}), 400

        cursor.execute(
            "INSERT INTO trainer_players (trainer_id, player_id) VALUES (%s, %s)",
            (trainer_id, player_id),
        )
        conn.commit()
        return jsonify({"message": "Player assigned successfully"}), 200
    except Exception as e:
        conn.rollback()
        return jsonify({"error": str(e)}), 400
    finally:
        cursor.close()
        conn.close()

@auth_bp.route("dashboard/trainer/add-performance", methods=["POST"])
@jwt_required()
def add_performance():
    data = request.get_json()
    trainer_id = get_jwt_identity()
    player_id = data.get("player_id")
    speed = data.get("speed")
    agility = data.get("agility")
    endurance = data.get("endurance")
    stamina = data.get("stamina")
    recorded_at = data.get("recorded_at")

    if not all([player_id, speed, agility, endurance, stamina, recorded_at]):
        return jsonify({"error": "All fields are required"}), 400

    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=DictCursor)

        cursor.execute(
            "SELECT * FROM trainer_players WHERE trainer_id = %s AND player_id = %s",
            (trainer_id, player_id),
        )
        if not cursor.fetchone():
            return jsonify({"error": "You are not assigned to this player"}), 403

        cursor.execute(
            """
            INSERT INTO performance_tracking (user_id, speed, agility, endurance, stamina, recorded_at)
            VALUES (%s, %s, %s, %s, %s, %s)
            """,
            (player_id, speed, agility, endurance, stamina, recorded_at),
        )

        conn.commit()
        return jsonify({"message": "Performance added successfully"}), 201

    except psycopg2.Error as e:
        conn.rollback()
        return jsonify({"error": f"Database error: {str(e)}"}), 500

    except Exception as e:
        return jsonify({"error": f"Server error: {str(e)}"}), 500

    finally:
        cursor.close()
        conn.close()

@auth_bp.route("/dashboard/trainer/add-tracker", methods=["POST"])
@jwt_required()
def add_tracker():
    data = request.get_json()
    trainer_id = get_jwt_identity()
    player_id = data.get("player_id")
    heart_rate = data.get("heart_rate")
    steps_taken = data.get("steps_taken")
    distance_covered = data.get("distance_covered")
    recorded_at = data.get("recorded_at")

    if not all([player_id, heart_rate, steps_taken, distance_covered, recorded_at]):
        return jsonify({"error": "All fields are required"}), 400

    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=DictCursor)

        cursor.execute(
            "SELECT * FROM trainer_players WHERE trainer_id = %s AND player_id = %s",
            (trainer_id, player_id),
        )
        if not cursor.fetchone():
            return jsonify({"error": "You are not assigned to this player"}), 403

        cursor.execute(
            """
            INSERT INTO tracker_data (user_id, heart_rate, steps_taken, distance_covered, recorded_at)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (player_id, heart_rate, steps_taken, distance_covered, recorded_at),
        )

        conn.commit()
        return jsonify({"message": "Tracker data added successfully"}), 201

    except psycopg2.Error as e:
        conn.rollback()
        return jsonify({"error": f"Database error: {str(e)}"}), 500

    except Exception as e:
        return jsonify({"error": f"Server error: {str(e)}"}), 500

    finally:
        cursor.close()
        conn.close()

@auth_bp.route("/dashboard/trainer/add-session", methods=["POST"])
@jwt_required()
def add_session():
    data = request.get_json()
    trainer_id = get_jwt_identity()
    player_id = data.get("player_id")
    session_type = data.get("session_type")
    duration = data.get("duration")
    calories_burned = data.get("calories_burned")
    session_date = data.get("session_date")
    intensity = data.get("intensity")

    if not all([player_id, session_type, duration, calories_burned, session_date, intensity]):
        return jsonify({"error": "All fields are required"}), 400

    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=DictCursor)

        cursor.execute(
            "SELECT * FROM trainer_players WHERE trainer_id = %s AND player_id = %s",
            (trainer_id, player_id),
        )
        if not cursor.fetchone():
            return jsonify({"error": "You are not assigned to this player"}), 403

        cursor.execute(
            """
            INSERT INTO training_sessions (user_id, session_type, duration, calories_burned, session_date, intensity)
            VALUES (%s, %s, %s, %s, %s, %s)
            """,
            (player_id, session_type, duration, calories_burned, session_date, intensity),
        )

        conn.commit()
        return jsonify({"message": "Session added successfully"}), 201

    except psycopg2.Error as e:
        conn.rollback()
        return jsonify({"error": f"Database error: {str(e)}"}), 500

    except Exception as e:
        return jsonify({"error": f"Server error: {str(e)}"}), 500

    finally:
        cursor.close()
        conn.close()