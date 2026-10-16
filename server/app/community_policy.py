from typing import Annotated

from fastapi import Depends, HTTPException

from .database import userAccount
from .security import userDependency

community_policy_version = '2026-10-16'
community_policy_sections = [
    {
        'title': '이용약관과 커뮤니티 이용 정책',
        'title_en': 'Terms of Use and Community Guidelines',
        'body': "운영자 sayudogu가 제공하는 DON'T SKIP의 계정과 운동 모임을 이용할 때 적용됩니다. "
        '챌린지 방 이름·소개·규칙, 표시 이름, 질문·답변 등 다른 이용자가 접하는 콘텐츠에 적용됩니다. '
        '개인정보 처리에 관한 안내는 별도의 개인정보처리방침을 확인해 주세요.',
        'body_en': "These terms apply to accounts and workout communities in DON'T SKIP, operated by "
        'sayudogu. They cover names, room descriptions, rules, questions, replies and other content '
        'visible to other users. Personal data handling is described separately in the Privacy Policy.',
    },
    {
        'title': '금지하는 콘텐츠와 행동',
        'title_en': 'Prohibited content and behavior',
        'body': '성적 착취·아동 학대·불법 콘텐츠, 음란물, 혐오·차별, 폭력·협박·괴롭힘, '
        '타인의 개인정보·사진 무단 공개, 사칭, 저작권 침해, 스팸·사기와 위험한 운동 강요를 금지합니다. '
        '본인이 공유할 권한이 있는 내용만 올리고 다른 이용자의 동의와 안전을 존중해야 합니다.',
        'body_en': 'Sexual exploitation, child abuse, illegal or sexually explicit content, hate, '
        'discrimination, violence, threats, harassment, doxxing, unauthorized photos, impersonation, '
        'copyright infringement, spam, scams and pressure to perform dangerous exercise are prohibited. '
        'Share only content you have the right to share and respect other people’s consent and safety.',
    },
    {
        'title': '신고·차단과 운영 조치',
        'title_en': 'Reporting, blocking and moderation',
        'body': '앱의 신고 기능으로 콘텐츠·이용자를 신고할 수 있으며, 차단하면 해당 이용자와의 '
        '코칭 대화와 직접 알림이 제한되고 해당 이용자의 콘텐츠가 숨겨집니다. 운영자는 신고 내용을 '
        '검토하고 콘텐츠 숨김, 계정 이용 제한 등의 조치를 할 수 있습니다. 방장도 신고·차단 대상입니다. '
        '조치에 대한 문의·이의 제기는 sayudogu@gmail.com으로 보낼 수 있습니다.',
        'body_en': 'Use the in-app reporting controls to report content or users. Blocking hides that '
        'user’s content and prevents coaching conversations and direct notifications between you. '
        'Hosts can also be reported or blocked. Moderators review reports and may remove content or '
        'suspend accounts. Contact sayudogu@gmail.com with questions or appeals.',
    },
    {
        'title': '운동 기록·공유와 서비스 이용',
        'title_en': 'Workout records, sharing and use of the service',
        'body': '챌린지에서는 표시 이름과 출석·평가 결과가 참가자에게, 종료 후 상세 성장 리포트가 '
        '방장에게 표시될 수 있습니다. 코칭 대화는 작성자와 수신 방장 사이에 제공되며 신고하면 '
        '신고 대상 내용이 운영자에게 전달됩니다. 운동 기록·코칭은 의료 진단이나 치료를 대신하지 않습니다. '
        '계정은 설정에서 삭제할 수 있고, 정책이 바뀌면 변경된 내용을 확인하고 동의한 후 커뮤니티에 '
        '참여해야 합니다. 삭제·차단·신고 기능을 악용하거나 타인의 계정을 이용해서는 안 됩니다.',
        'body_en': 'Challenge participants can see your display name, attendance and evaluation results. '
        'Hosts may see detailed growth reports after the challenge ends. Coaching is shared with the '
        'author and receiving host; reported content is disclosed to moderators for review. Workout '
        'records and coaching do not replace medical diagnosis or treatment. You can delete your '
        'account in Settings. Updated community terms require renewed acceptance before participation. '
        'Do not misuse safety features or use another person’s account.',
    },
]


def require_community_user(user: userDependency):
    if user.community_policy_version != community_policy_version:
        raise HTTPException(409, '커뮤니티 이용약관을 확인하고 동의해 주세요.')
    return user


communityUserDependency = Annotated[userAccount, Depends(require_community_user)]
