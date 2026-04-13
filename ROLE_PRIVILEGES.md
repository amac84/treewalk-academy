# Role Privileges

This document tracks what each role can do in the current app behavior.

## Roles

- `learner`
- `instructor`
- `content_admin`
- `hr_admin`
- `super_admin`

## Privilege Matrix

| Capability | learner | instructor | content_admin | hr_admin | super_admin |
| --- | --- | --- | --- | --- | --- |
| Access learner pages (`/home`, `/courses`, `/my-learning`, `/webinars`) | Yes | Yes | Yes | No | Yes |
| Access admin shell (`/admin`) | No | Yes | Yes | Yes | Yes |
| Access admin courses page (`/admin/courses`) | No | Yes | Yes | No | Yes |
| Create draft courses | No | Yes | Yes | No | Yes |
| Edit course details (title, summary, description, category, topic, level) | No | Own courses | All courses | No | All courses |
| Reassign course instructor | No | No | Yes | No | Yes |
| Add segments to owned/managed courses | No | Own courses | All courses | No | All courses |
| Upload/replace Mux videos on segments | No | Own courses | All courses | No | All courses |
| Move course `draft -> review` | No | Own courses | Yes | No | Yes |
| Move course `review -> published` | No | No | Yes | No | Yes |
| Move course `published -> review` or `review -> draft` | No | No | Yes | No | Yes |
| Access admin users page (`/admin/users`) | No | No | No | Yes | Yes |
| Issue invites | No | No | No | Yes | Yes |
| Suspend/unsuspend users | No | No | No | Yes | Yes |
| View admin reports page (`/admin/reports`) | No | Yes | Yes | Yes | Yes |

## Notes

- Instructors can only manage courses where `course.instructorId` matches their user id.
- `content_admin` and `super_admin` can manage all courses.
- New courses are created as `draft` via **Upload video to start course** (title from filename; details editable on the workflow card).
- Learners can enroll only in `published` courses.
