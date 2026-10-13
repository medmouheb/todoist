package com.doable.project;

import com.doable.common.NotFoundException;
import com.doable.mail.MailService;
import com.doable.notification.NotificationService;
import com.doable.project.ProjectDtos.InviteRequest;
import com.doable.project.ProjectDtos.InviteResponse;
import com.doable.project.ProjectDtos.MemberResponse;
import com.doable.project.ProjectDtos.SharingResponse;
import com.doable.task.TaskRepository;
import com.doable.user.User;
import com.doable.user.UserRepository;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/** Inviting people to a project, changing their role and removing them. */
@Service
public class SharingService {

    private final ProjectAccess access;
    private final ProjectRepository projects;
    private final ProjectMemberRepository members;
    private final ProjectInviteRepository invites;
    private final UserRepository users;
    private final TaskRepository tasks;
    private final NotificationService notifications;
    private final MailService mail;

    public SharingService(ProjectAccess access, ProjectRepository projects, ProjectMemberRepository members,
                          ProjectInviteRepository invites, UserRepository users, TaskRepository tasks,
                          NotificationService notifications, MailService mail) {
        this.access = access;
        this.projects = projects;
        this.members = members;
        this.invites = invites;
        this.users = users;
        this.tasks = tasks;
        this.notifications = notifications;
        this.mail = mail;
    }

    @Transactional(readOnly = true)
    public SharingResponse sharing(Long userId, Long projectId) {
        Role myRole = access.role(userId, projectId);
        return new SharingResponse(myRole, members(projectId), pendingInvites(projectId));
    }

    @Transactional(readOnly = true)
    public List<MemberResponse> members(Long projectId) {
        List<ProjectMember> ms = members.forProject(projectId);
        Map<Long, User> byId = users.byIds(ms.stream().map(ProjectMember::getUserId).toList());
        return ms.stream().map(m -> {
            User u = byId.get(m.getUserId());
            return new MemberResponse(u.getId(), u.getName(), u.getEmail(), User.initials(u.getName()), m.getRole());
        }).toList();
    }

    @Transactional
    public InviteResponse invite(Long userId, Long projectId, InviteRequest req) {
        Project p = access.require(userId, projectId, Role.ADMIN);
        if (p.isInbox()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "The Inbox is personal and can't be shared.");
        }
        String email = req.email().trim().toLowerCase();
        User invitee = users.findByEmailIgnoreCase(email).orElse(null);
        if (invitee != null && access.isMember(invitee.getId(), projectId)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, invitee.getName() + " is already in this project.");
        }
        if (invites.findByProjectIdAndEmailIgnoreCase(projectId, email).isPresent()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "That person has already been invited.");
        }
        User inviter = users.findById(userId).orElseThrow();
        ProjectInvite invite = invites.save(new ProjectInvite(projectId, email, req.role(), userId));

        if (invitee != null) {
            notifications.invited(invitee.getId(), inviter, p, invite);
            mail.send(email, inviter.getName() + " invited you to “" + p.getName() + "”",
                    inviter.getName() + " invited you to join the project “" + p.getName() + "” on Doable.\n\n"
                            + "Accept or decline here:\n" + mail.link("/invites"));
        } else {
            mail.send(email, inviter.getName() + " invited you to “" + p.getName() + "”",
                    inviter.getName() + " invited you to join the project “" + p.getName() + "” on Doable.\n\n"
                            + "Create a free account with this email address to join:\n" + mail.link("/signup"));
        }
        return toResponse(invite, p, inviter);
    }

    @Transactional
    public void revokeInvite(Long userId, Long projectId, Long inviteId) {
        access.require(userId, projectId, Role.ADMIN);
        ProjectInvite invite = invites.findById(inviteId).filter(i -> i.getProjectId().equals(projectId))
                .orElseThrow(() -> new NotFoundException("Invite"));
        invites.delete(invite);
    }

    @Transactional
    public void changeRole(Long userId, Long projectId, Long memberId, Role role) {
        access.require(userId, projectId, Role.ADMIN);
        ProjectMember m = members.find(projectId, memberId).orElseThrow(() -> new NotFoundException("Member"));
        if (m.getRole() == Role.ADMIN && role != Role.ADMIN && members.countWithRole(projectId, Role.ADMIN) == 1) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A project needs at least one admin.");
        }
        m.setRole(role);
    }

    /** Admins can remove anyone; anyone can remove themselves (leave). */
    @Transactional
    public void removeMember(Long userId, Long projectId, Long memberId) {
        if (!userId.equals(memberId)) {
            access.require(userId, projectId, Role.ADMIN);
        }
        Project p = projects.findById(projectId).orElseThrow(() -> new NotFoundException("Project"));
        if (p.isInbox()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "You can't leave your Inbox.");
        }
        ProjectMember m = members.find(projectId, memberId).orElseThrow(() -> new NotFoundException("Member"));
        if (m.getRole() == Role.ADMIN && members.countWithRole(projectId, Role.ADMIN) == 1) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    members.forProject(projectId).size() == 1
                            ? "You're the only person in this project. Delete it instead."
                            : "Make someone else an admin first.");
        }
        members.delete(m);
        tasks.unassignInProject(projectId, memberId);
    }

    /** Invites waiting for this user's email address. */
    @Transactional(readOnly = true)
    public List<InviteResponse> myInvites(Long userId) {
        User me = users.findById(userId).orElseThrow();
        return invites.findByEmailIgnoreCaseOrderByCreatedAtDesc(me.getEmail()).stream()
                .map(i -> toResponse(i, projects.findById(i.getProjectId()).orElseThrow(),
                        users.findById(i.getInvitedBy()).orElse(null)))
                .toList();
    }

    @Transactional
    public void respond(Long userId, Long inviteId, boolean accept) {
        User me = users.findById(userId).orElseThrow();
        ProjectInvite invite = invites.findById(inviteId)
                .filter(i -> i.getEmail().equalsIgnoreCase(me.getEmail()))
                .orElseThrow(() -> new NotFoundException("Invite"));
        Project p = projects.findById(invite.getProjectId()).orElseThrow();
        if (accept && !access.isMember(userId, p.getId())) {
            members.save(new ProjectMember(p.getId(), userId, invite.getRole()));
        }
        invites.delete(invite);
        notifications.inviteAnswered(invite.getInvitedBy(), me, p, accept);
    }

    private InviteResponse toResponse(ProjectInvite i, Project p, User inviter) {
        return new InviteResponse(i.getId(), p.getId(), p.getName(), i.getEmail(), i.getRole(),
                inviter == null ? null : inviter.getName(), i.getCreatedAt());
    }

    private List<InviteResponse> pendingInvites(Long projectId) {
        Project p = projects.findById(projectId).orElseThrow();
        return invites.findByProjectIdOrderByCreatedAt(projectId).stream()
                .map(i -> toResponse(i, p, users.findById(i.getInvitedBy()).orElse(null))).toList();
    }
}
